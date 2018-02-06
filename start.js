var path = require('path');
var argv = require('minimist')(process.argv.slice(2));
var exitHook = require('async-exit-hook');
var ComManager = require ("./lib/com.js").ComManager;
var Connector = require ("./lib/connector.js").Connector;
var Logger = require ("./lib/log").Logger;

//logger
var loggerFactory;
if ("dev" in argv) loggerFactory = new Logger("console");  //in dev mode write log to console
else loggerFactory = new Logger ("file");                  //in production write log to file

var logger = loggerFactory.create({component: "index.js"});

//1. create an instance of the connector according to the configuration
logger.info ("Initiating connector instance");
var connector = new Connector ();

//2. create com service
logger.info ("Initiating com instance");
var com = new ComManager(connector,{ logger });

//3. On Exit hook and exceptions:
exitHook(callback => {
    logger.info(`Stopping connector...`);
    com.stop().catch().then(connector.stop.bind(connector)).then(()=>logger.info(`Bye bye`)).then(()=>process.exit());
});
exitHook.uncaughtExceptionHandler(err => logger.error (`Caught global exception: ${err.stack}`));
exitHook.unhandledRejectionHandler(err => logger.error (`Caught global async rejection: ${err.stack}`));

//4. bootstrap connector
com.start()
	.then(() => com.pollForTask())
	.catch(err=>logger.error(`Could not start connector ${err.message}`));
