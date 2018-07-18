require('syswide-cas');
var path = require('path');
var argv = require('minimist')(process.argv.slice(2));
var exitHook = require('async-exit-hook');
var ComManager = require ("./lib/com.js").ComManager;
var Connector = require ("./lib/connector.js").Connector;
var Logger = require ("./lib/log").Logger;
var LogCleaner = require ("./lib/logCleaner");
var handlers = require("./lib/taskHandlers.js");
var jslt = require('jslt');
var TaskFactory =  require("./lib/task.js");
var com, transform = jslt.transform;
const ARCHIVE_PATH = "log_archive";

process.title = process.env["CONTROLLER_TITLE"] || path.basename(process.cwd());
var [connectorName, connectorVersion] = process.title.split("@");

//logger
process.env.logStream = "dev" in argv ? "console" : "file"; //in dev mode write log to console, in production write log to file
var loggerFactory = new Logger(process.env.logStream);
var logger = loggerFactory.create({}).child({component: "index.js", module: "connectors", connectorName, connectorVersion});
if (process.env.logStream == "file") {
	let fs = require("fs");
	if (!fs.existsSync(ARCHIVE_PATH)) fs.mkdirSync(ARCHIVE_PATH);
	
	let logCleaner = new LogCleaner("log", { hours : 1, size : 50, onlyDirs : true}, logger);
	logCleaner.removeFunc = filepath => new Promise(resolve => {
		fs.rename(filepath, path.join(ARCHIVE_PATH, path.basename(filepath)), resolve);
	});
	logCleaner.startMonitor(32);
	
	logCleaner = new LogCleaner(ARCHIVE_PATH, { hours : 48, size : 50, onlyDirs : true }, logger);
	logCleaner.startMonitor(30);
}

//1. get configuration
var config = require('./lib/config').getConfiguration({logger: logger.child({component: "config"})});
logger = logger.child ({connectorId: config.controllerConfig.connectorId});

//2. create an instance of the connector according to the configuration
logger.info ("Initiating connector instance");
var API;

function createTaskClasses(config, backendFactory){
    return TaskFactory({
        handlers,
        config,
        backendFactory,
        Connector,
        logger
    });
}

function startRemoteMode(config) {
	logger.info("Remote mode");

	if (!config.creds || !config.creds.apiKey || !config.creds.apiSecret)
		throw "API credentials was not found in configuration";
	
	var apiUrl = config.apiUrl;
	var requestHeaders = {
		"x-capriza-api-key"			: config.creds.apiKey,
		"x-capriza-secret"			: config.creds.apiSecret,
		"x-capriza-connector-id"	: config.connectorId
	};
	
	const BackendAPI = require("./lib/backendAPI.js");
	API = new BackendAPI(apiUrl, requestHeaders, {connectorId: config.connectorId}, logger);

    var TaskClasses = createTaskClasses(config, (conf, logger)=>new BackendAPI(apiUrl, requestHeaders, conf, logger));
	com = new ComManager({ apiUrl, requestHeaders, TaskClasses, logger, config });
}

function startLocalMode(config) {
    logger.info ("Local mode");
    transform = transformWithErrors;
    API = new LocalAPI();

    var TaskClasses = createTaskClasses(config, (conf, logger)=>new LocalAPI(conf, logger));
    var LocalServer = localMode.LocalServer;
    com = new LocalServer(TaskClasses, logger);
}

function onLocalFileChange(context){
    logger.info(`Reloading connector`);
    Connector.stop().catch().then(()=>{
        config = require('./lib/config').getConfiguration({logger: logger.child({component: "config"})});
        var TaskClasses = createTaskClasses(config.controllerConfig, (conf, logger)=>new LocalAPI(conf, logger));
        com.setTaskClasses(TaskClasses);
        com.onFileChanged(context);
        LocalAPI.resetState();
    }).then(async ()=>Connector.init({config,logger,transform})).then(()=>logger.info(`Done reloading connector`));
}

function transformWithErrors(data, template, props = {}){
    var res;
    props.continueOnError = true;
    try{
        res = jslt.transform(data, template, props);
    } catch (ex){
        res = ex.result;
        res.jsltErrors = ex.errors;
    }

    return res;
}

//3. Initializing com manager instance (local or remote)
try{
    if ("local" in argv){
        var localMode = require('@capriza/as-inspector'),
            watch = localMode.Watcher,
            LocalAPI = localMode.api;

        startLocalMode(config.controllerConfig);
        watch(onLocalFileChange)
    } else {
        startRemoteMode(config.controllerConfig);
    }
} catch (err) {
    logger.error(`Failed to create ComManager instance ${err.stack}.`);
    logger.info(`Stopping connector`);
    setTimeout(() => {
        process.exit();
    },100);
    return;
}

//4. On Exit hook and exceptions:
exitHook(callback => {
    logger.info(`Stopping connector...`);
    com.stop().catch().then(() => Connector.stop()).then(()=>logger.info(`Bye bye`)).then(()=>process.exit());
});
exitHook.uncaughtExceptionHandler(err => logger.error (`Caught global exception: ${err.stack}`));
exitHook.unhandledRejectionHandler(err => logger.error (`Caught global async rejection: ${err.stack}`));

async function run(attempts){
    try {
        logger.info(`Run ${attempts}`);
        await com.start();
    }
    catch (ex) {
        logger.error(`[Attempt ${attempts}] Could not start connector: ${ex.stack || ex}`);
        if (attempts <= 20) {
            var nextAttempt = attempts * 10 * 1000;
            logger.info (`Trying to start connector again in ${nextAttempt / 1000}s...`);
            setTimeout (() => run(++attempts), nextAttempt);
        }
        else process.exit(2);
    }
}

//5. Bootstrap connector
logger.info ("Initializing connector");
Connector.init({config,logger,transform})
    .then(async (taskTypes) => {

        if(API.sendConnectorData) {
            try {
                logger.info(`Sending connector info to the api. task types: ${taskTypes}`);
                await API.sendConnectorData({taskTypes, uiMappings: getUiMappings(), authRequired: taskTypes.includes("authenticate") })
            } catch (ex) {
                logger.error(`Failed to send task types to the api: ${ex.stack || ex}`);
            }
        } else {
            logger.info(`sendConnectorTaskTypes not exists in the API, won't send task types`);
        }

        run(1)
    }) //1st attempt
    .catch(err=>{
        logger.error(`Connector initialization failed ${err}\n${err.stack}`);
        process.exit(2);
    });

function getUiMappings() {
    var res = [];
    var uiTemplates;
    try{
        uiTemplates = require(path.resolve(`./resources/ui-templates.json`));
    } catch(ex) {
        logger.info(`There is no ui-templates.json file`);
        return;
    }

    for(var key in uiTemplates) {
        logger.info(`key: ${key}`);
        if(!uiTemplates[key].type) {
            logger.info(`${key}: type is missing in the ui template`);
            break;
        }

        var temp = {
            schemaId: key,
            uiTemplate: uiTemplates[key],
            type: uiTemplates[key].type
        };
        delete temp.uiTemplate.type;
        res.push(temp);
    }

    return res;
}