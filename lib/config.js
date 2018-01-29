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
                configFilePath = "./resources/config.json";
                logger.info (`Getting configuration from default static path ('./resources/config.json')`);
            }
            config = require(path.resolve(configFilePath));
            if (typeof config.caprizaConfig === "string") {
                logger.info (`Fetching and parsing connector credentials from: ${config.caprizaConfig}`);
                Object.assign(config.controllerConfig, JSON.parse(fs.readFileSync(config.caprizaConfig)));
            }
            if (typeof config.systemConfig === "string") {
                logger.info (`Fetching and parsing system credentials from: ${config.systemConfig}`);
                Object.assign(config.blConfig, JSON.parse(fs.readFileSync(config.systemConfig)));
            }

        }
        catch (ex){
            logger.error ("Couldn't get credentials: " + ex);
        }

        return config;
    }
};