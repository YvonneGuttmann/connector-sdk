'use strict'
var argv = require('minimist')(process.argv.slice(2));
var path = require('path');
var fs = require('fs');
var config;

var Configuration = {
    getConfig(options){
        if (config) return config;

        config = require(path.resolve(process.env.CONNECTOR_CONFIG_PATH || argv["config-file"]));
        this.process({parseFile:["creds", "runtimeConfig"]}, config._controller);

        return config;
    },

    process(options = {}, target = config){
        if (options.parseFile){
            options.parseFile.forEach(file=>{
                if (typeof target[file] === "string"){
                    target[file] = JSON.parse(fs.readFileSync(target[file]));
                }
            })
        }

        return target;
    }
}

module.exports = Configuration;