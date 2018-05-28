require('syswide-cas');
var path = require('path');
var argv = require('minimist')(process.argv.slice(2));
var exitHook = require('async-exit-hook');
var ComManager = require ("./lib/com.js").ComManager;
var Connector = require ("./lib/connector.js").Connector;
var Logger = require ("./lib/log").Logger;
var com;

process.title = process.env["CONTROLLER_TITLE"] || path.basename(process.cwd());
var [connectorName, connectorVersion] = process.title.split("@");

//logger
var loggerFactory;
if ("dev" in argv) process.env.logStream = "console"; //in dev mode write log to console
else process.env.logStream = "file"; //in production write log to file
loggerFactory = new Logger(process.env.logStream);

var logger = loggerFactory.create({}).child({component: "index.js", module: "connectors", connectorName: connectorName, connectorVersion: connectorVersion});

//1. get configuration
var config = require('./lib/config').getConfiguration({logger: logger.child({component: "config"})});
logger = logger.child ({connectorId: config.controllerConfig.connectorId});

//2. create an instance of the connector according to the configuration
logger.info ("Initiating connector instance");
var connector = new Connector ({logger});

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
	
	var BackendAPI = require("./lib/backendAPI.js");

	var TaskClasses = require("./lib/task.js")({
		handlers	    : require("./lib/taskHandlers.js"),
		config		    : config,
        backendFactory  : (conf, logger)=>new BackendAPI(apiUrl, requestHeaders, conf, logger),
		connector	    : connector,
		logger		    : logger
	});
	com = new ComManager({ apiUrl, requestHeaders, TaskClasses, logger, config });
}

function startLocalMode(config) {
    logger.info ("Local mode");
    var LocalAPI = require("./lib/local/api.js");
    var TaskClasses = require("./lib/task.js")({
        handlers	    : require("./lib/taskHandlers.js"),
        config		    : config,
        backendFactory  : (conf, logger)=>new LocalAPI(conf, logger),
        connector	    : connector,
        logger		    : logger
    });
    var LocalServer = require ("./lib/local/server").LocalServer;
    com = new LocalServer(TaskClasses, logger);

}

function onLocalFileChange(){
    logger.info(`Reloading connector`);
    com.stop().catch().then(connector.stop.bind(connector)).then(()=>{
        config = require('./lib/config').getConfiguration({logger: logger.child({component: "config"})});
        connector = new Connector ({logger});
        startLocalMode(config.controllerConfig)
    }).then(async ()=>connector.init({config,logger})).then(com.start.bind(com)).then(()=>logger.info(`Done reloading connector`));
}

//3. Initializing com manager instance (local or remote)
try{
    if ("local" in argv){
        var watch = require ("./lib/local/watcher");
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
    com.stop().catch().then(connector.stop.bind(connector)).then(()=>logger.info(`Bye bye`)).then(()=>process.exit());
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
connector.init({config,logger})
    .then(()=>run(1)) //1st attempt
    .catch(err=>{
        logger.error(`Connector initialization failed ${err}`);
        process.exit(2);
    });
