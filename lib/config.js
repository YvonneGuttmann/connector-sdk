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
            config = context.mockConfig || require(path.resolve(configFilePath));
            if (typeof config.caprizaConfig === "string") {
                logger.info (`Loading controller credentials from: ${config.caprizaConfig}`);
                config.caprizaConfig = JSON.parse(fs.readFileSync(config.caprizaConfig))
            }
            if (typeof config.systemConfig === "string") {
                logger.info (`Loading system credentials from: ${config.systemConfig}`);
                var systemConfig = config.systemConfig;
                try {
                    systemConfig = fs.readFileSync(systemConfig);
                } catch (err) {
                    if (err.code === 'ENOENT') {
                        logger.info(`System config was not provided via file`)
                    } else {
                        throw err;
                    }
                }
                config.systemConfig = JSON.parse(systemConfig)
            }
            Object.assign(config.controllerConfig, config.caprizaConfig, { proxyUrl: config.proxyUrl });
            Object.assign(config.blConfig, config.systemConfig);

        }
        catch (ex){
            logger.error ("Couldn't get credentials: " + ex);
        }

        return config;
    }
};