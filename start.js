var path = require('path');
var argv = require('minimist')(process.argv.slice(2));
var exitHook = require('async-exit-hook');
var ComManager = require ("./lib/com.js").ComManager;
var Connector = require ("./lib/connector.js").Connector;
var Logger = require ("./lib/log").Logger;
var Configuration = require('./lib/config');

//logger
var loggerFactory;
if ("dev" in argv) loggerFactory = new Logger("console");  //in dev mode write log to console
else loggerFactory = new Logger ("file");                  //in production write log to file

var logger = loggerFactory.create({component: "index.js"});

process.on('uncaughtException', function(error) {
    logger.error(error);
});

//1. create an instance of the connector according to the configuration
logger.info ("Initiating connector instance");
var connector = new Connector ();

//2. create com service
logger.info ("Initiating com instance");
var com = new ComManager(connector,{ logger });

//3. On Exit hook
exitHook(callback => {
    logger.info(`Stopping connector...`);
    com.stop().catch().then(connector.stop.bind(connector)).then(()=>logger.info(`Bye bye`)).then(()=>process.exit());
});

var loopTimer;
function callLoop(timeout = 1000){
    if (loopTimer) return;

    loopTimer = setTimeout(async ()=>{
        loopTimer = null;
        var hasTask = await com.pollForTask();
        callLoop(hasTask ? 2000 : 50);
    }, timeout)
}

//4. bootstrap connector
com.start().then(()=>connector.init({ config: Configuration.getConfig(), logger: logger })).then(callLoop).catch(err=>logger.error(`Could not start connector ${err.message}`));


