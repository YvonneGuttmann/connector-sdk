'use strict'
var argv = require('minimist')(process.argv.slice(2));
var path = require('path');
var fs = require('fs');

module.exports = {
    getConfiguration (context){
        var logger = context.logger;
        var config;
        try {
            logger.info ("Getting connector configuration");
            var configFilePath;
            if (process.env.CONNECTOR_CONFIG_PATH){
                configFilePath = process.env.CONNECTOR_CONFIG_PATH;
                logger.info (`Getting configuration from env variable CONNECTOR_CONFIG_PATH: ${process.env.CONNECTOR_CONFIG_PATH}`);
            }
            else if (argv["config-file"]){
                configFilePath = argv["config-file"];
                logger.info (`Getting configuration from param config-file: ${configFilePath}`);
            }
            else {
                configFilePath = "./config.json";
                logger.info (`Getting configuration from default static path ('./config.json')`);
            }
            config = require(configFilePath);
            if (typeof config.controllerConfig.creds === "string") {
                logger.info (`Fetching and parsing connector credentials from: ${config.controllerConfig.creds}`);
                config.controllerConfig.creds = JSON.parse(fs.readFileSync(config.controllerConfig.creds))
            }

        }
        catch (ex){
            logger.error ("Couldn't get credentials: " + ex);
        }

        return config;
    }
};