require('syswide-cas');
var path = require('path');
var argv = require('minimist')(process.argv.slice(2));
var exitHook = require('async-exit-hook');
var ComManager = require ("./lib/com.js").ComManager;
var Connector = require ("./lib/connector.js").Connector;
var Logger = require ("./lib/log").Logger;
var LocalServer = require ("./lib/server").LocalServer;
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

//3. Initializing com manager instance (local or remote)
try{
    if ("local" in argv){
        logger.info ("Local mode");
        com = new LocalServer(connector, logger)
    } else {
        logger.info("Remote mode");
        com = new ComManager(connector,{ logger, config });
    }
} catch (err) {
    logger.error(`Failed to create ComManager instance ${err}.`);
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
