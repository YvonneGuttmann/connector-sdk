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
var API;
var LocalAPI;
var config;
var uiTemplates;
const ARCHIVE_PATH = "log_archive";
const fs = require("fs");

process.title = process.env["CONTROLLER_TITLE"] || path.basename(process.cwd());
var [connectorName, connectorVersion] = process.title.split("@");

//logger
if (!fs.existsSync("log")) fs.mkdirSync("log");
process.env.logStream = "dev" in argv ? "console" : "file"; //in dev mode write log to console, in production write log to file
var logger = new Logger(process.env.logStream == "console" ?
	{ consoleMode : "text" } :
	{ consoleMode : "json", fileMode: "text", chindings : { connectorName, connectorVersion } });
	
logger.startLogRotation();

if (process.env.logStream == "file") {
	if (!fs.existsSync(ARCHIVE_PATH)) fs.mkdirSync(ARCHIVE_PATH);
	
	let logCleaner = new LogCleaner("log", { hours : 1, size : 50, onlyDirs : true}, logger);
	logCleaner.removeFunc = filepath => new Promise(resolve => {
		fs.rename(filepath, path.join(ARCHIVE_PATH, path.basename(filepath)), resolve);
	});
	logCleaner.startMonitor(32);
	
	logCleaner = new LogCleaner(ARCHIVE_PATH, { hours : 48, size : 50, onlyDirs : true }, logger);
	logCleaner.startMonitor(30);
}

function createTaskClasses(controllerConfig, backendFactory){
    return TaskFactory({
        handlers,
        config: controllerConfig,
        backendFactory,
        Connector,
        logger
    });
}

function startRemoteMode(controllerConfig) {
    logger.info("Remote mode");

	if (!controllerConfig.creds || !controllerConfig.creds.apiKey || !controllerConfig.creds.apiSecret)
		throw "API credentials was not found in configuration";
	
	var apiUrl = controllerConfig.apiUrl;
	var requestHeaders = {
		"x-capriza-api-key"			: controllerConfig.creds.apiKey,
		"x-capriza-secret"			: controllerConfig.creds.apiSecret,
		"x-capriza-connector-id"	: controllerConfig.connectorId,
		"x-capriza-sdk-version"		: require("./package.json").version
	};
	
	const BackendAPI = require("./lib/backendAPI.js");
	API = new BackendAPI(apiUrl, requestHeaders, {connectorId: controllerConfig.connectorId}, logger);

    var TaskClasses = createTaskClasses(controllerConfig, (conf, logger)=>new BackendAPI(apiUrl, requestHeaders, conf, logger));
	com = new ComManager({ apiUrl, requestHeaders, TaskClasses, logger, config: controllerConfig });
}

function startLocalMode(controllerConfig, LocalServer) {
    logger.info ("Local mode");
    transform = transformWithErrors;
    API = new LocalAPI();

    var TaskClasses = createTaskClasses(controllerConfig, (conf, logger)=>new LocalAPI(conf, logger));
    com = new LocalServer(TaskClasses, logger);
}

function onLocalFileChange(context){
    logger.info(`Reloading connector`);
    Connector.stop().catch().then(async ()=>{
        config = await require('./lib/config').getConfiguration({logger: logger.child({component: "config"})});
        var TaskClasses = createTaskClasses(config.controllerConfig, (conf, logger)=>new LocalAPI(conf, logger));
        com.setTaskClasses(TaskClasses);
        com.onFileChanged(context);
        LocalAPI.resetState();
    }).then(async ()=>Connector.init({config,logger,transform, uiTemplates})).then(()=>logger.info(`Done reloading connector`));
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

function getUiMappings() {
    var res = [];
    let uiTemplates;
    try{
        uiTemplates = require(path.resolve(`./resources/ui-templates.json`));
    } catch(ex) {
        logger.error(`Failed to load ui-templates.json ${ex.message}`);
        return;
    }

    for(var key in uiTemplates) {
        if(!uiTemplates[key].type) {
            logger.info(`${key}: type is missing in the ui template`);
            break;
        }

        var temp = {
            schemaId: key,
            uiTemplate: uiTemplates[key],
            type: uiTemplates[key].type
        };
        res.push(temp);
    }

    return res;
}

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

//On Exit hook and exceptions:
exitHook(callback => {
    logger.info(`Stopping connector...`);
    com.stop().catch().then(() => Connector.stop()).then(()=>logger.info(`Bye bye`)).then(()=>process.exit());
});

process.on('uncaughtException', err => {
    logger.error(`Caught global exception. Error: ${err.message || err}\nStack trace:\n${err.stack}`);
});

process.on('unhandledRejection', reason => {
    logger.error(`Caught global async rejection: ${reason}`)
});

(async () => {
    //1. get configuration
    config = await require('./lib/config').getConfiguration({logger: logger.child({component: "config"})});
    logger = logger.child ({connectorId: config.controllerConfig.connectorId});

    //2. create an instance of the connector according to the configuration
    logger.info ("Initiating connector instance");

    //3. Initializing com manager instance (local or remote)
    try{
        if ("local" in argv){
            var localMode = require('@capriza/as-inspector'),
                watch = localMode.Watcher;
            LocalAPI = localMode.api;

            startLocalMode(config.controllerConfig, localMode.LocalServer);
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

    //4. Loading ui-templates.json
    try{
        uiTemplates = require(path.resolve(`./resources/ui-templates.json`));
    } catch(ex) {
        logger.error(`Failed to load ui-templates.json !! ${ex.message}`);
        return;
    }

    //5. Bootstrap connector
    logger.info ("Initializing connector");
    Connector.init({config,logger,transform, uiTemplates})
        .then(async (taskTypes) => {

            if(API.sendConnectorData) {
                try {
                    logger.info(`Sending connector info to the api. task types: ${taskTypes}`);
                    await API.sendConnectorData({taskTypes, uiMappings: getUiMappings(), authRequired: taskTypes.includes("authenticate") })
                } catch (ex) {
                    logger.error(`Failed to send connector info to the api: ${ex.stack || ex}`);
                }
            } else {
                logger.info(`sendConnectorData does not exist in the API, won't send connector info to API`);
            }

            run(1)
        }) //1st attempt
        .catch(err=>{
            logger.error(`Connector initialization failed ${err}\n${err.stack}`);
            process.exit(2);
        });

})();