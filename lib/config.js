'use strict'
var argv = require('minimist')(process.argv.slice(2));
var path = require('path');

var Configuration = {
    getConfig(){
        var config = require(path.resolve(process.env.CONNECTOR_CONFIG_PATH || argv["config-file"]));

        return config }
}

module.exports = Configuration;