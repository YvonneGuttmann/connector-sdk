'use strict'
var argv = require('minimist')(process.argv.slice(2));
var path = require('path');
var fs = require('fs');
const AWS = require("aws-sdk");
const REGION = process.env.AWS_REGION;

async function load(secretName, logger) {
    let aws = new AWS.SecretsManager({
        region: REGION
    });

    return new Promise((resolve, reject) => {
        secretName = `${process.env.MS_NAME}/${secretName}`;
        aws.getSecretValue({ SecretId: secretName }, function(err, data) {
            if (err) {
                logger.error(`AWS secret ${secretName} from  ${REGION} retrieval failed: ${err.stack}.`);
                return reject(err);
            }

            logger.info(
                `loaded config ${secretName} from AWS secrets manager ${REGION}`
            );
            resolve(data.SecretString);
        });
    });
}

module.exports = {
    async getConfiguration (context){
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
                var caprizaConfig;
                if (process.env.AWS_REGION){
                    logger.info (`Loading caprizaConfig credentials from AWS Secret Manager. ${config.caprizaConfig}`);
                    caprizaConfig = await load(config.caprizaConfig, logger);
                } else {
                    logger.info (`Loading controller credentials from: ${config.caprizaConfig}`);
                    caprizaConfig = fs.readFileSync(config.caprizaConfig);
                }

                config.caprizaConfig = JSON.parse(caprizaConfig);
            }

            if (typeof config.systemConfig === "string") {
                var systemConfig = config.systemConfig;
                if (process.env.AWS_REGION){
                    logger.info (`Loading systemConfig credentials from AWS Secret Manager. ${config.systemConfig}`);
                    systemConfig = await load(config.systemConfig, logger);
                } else {
                    logger.info (`Loading controller credentials from: ${config.systemConfig}`);
                    try {
                        systemConfig = fs.readFileSync(systemConfig);
                    } catch (err) {
                        if (err.code === 'ENOENT') {
                            logger.info(`System config was not provided via file`);
                        } else {
                            throw err;
                        }
                    }
                }

                config.systemConfig = JSON.parse(systemConfig);
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