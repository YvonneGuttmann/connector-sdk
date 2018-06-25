var chai = require('chai');
var expect = chai.expect;
var config = require("../lib/config.js");

const requireUncached = require('require-uncached'); //for get new config every test (used for test2 and test3)

var Logger = require("../lib/log").Logger;
var loggerFactory = new Logger("console");
var logger = loggerFactory.create({component: "test/config.js"});


describe("load config file", function () {
    beforeEach(()=>{
    });
    it("~1 Getting configuration path from env variable should return the config file", function () {
        process.env.CONNECTOR_CONFIG_PATH = "mockConfig.json";
        var mockConfig = {caprizaConfig:{},systemConfig:{},controllerConfig:{},blConfig:{}};
        var result = config.getConfiguration({logger: logger, mockConfig: mockConfig});
        delete process.env.CONNECTOR_CONFIG_PATH;
        expect(result).to.equal(mockConfig);
    });
    it("~2 Getting configuration path from cli params should return the config file", function () {
        process.argv.push('--config-file');
        process.argv.push('my-fake-path');
        config = requireUncached("../lib/config.js");
        var mockConfig = {caprizaConfig: {}, systemConfig: {}, controllerConfig: {}, blConfig: {}};
        var result = config.getConfiguration({logger: logger, mockConfig: mockConfig});
        process.argv = process.argv.filter(element => element !== '--config-file' && element !== 'my-fake-path');
        expect(result).to.equal(mockConfig);
    });
    it("~3 Getting configuration path default path [./resources/config.json] should return the config file", function () {
        config = requireUncached("../lib/config.js");
        var mockConfig = {caprizaConfig: {}, systemConfig: {}, controllerConfig: {}, blConfig: {}};
        var result = config.getConfiguration({logger: logger, mockConfig: mockConfig});
        expect(result).to.equal(mockConfig);
    });
});

describe("parse config file", function(){
    it("~4 check when caprizaConfig is String, should return the config file", function () {
        var mockConfig = {caprizaConfig: "./mockConfig/caprizaConfig.json", systemConfig: {}, controllerConfig: {}, blConfig: {}};
        var result = config.getConfiguration({logger: logger, mockConfig: mockConfig});
        expect(result).to.equal(mockConfig);
    });
    it("~5 check when systemConfig is String, should return the config file", function () {
        var mockConfig = {caprizaConfig: {}, systemConfig: "./mockConfig/systemConfig.json", controllerConfig: {}, blConfig: {}};
        var result = config.getConfiguration({logger: logger, mockConfig: mockConfig});
        expect(result).to.equal(mockConfig);
    });
    it("~6 check when adding proxyUrl, should return the config file", function () {
        var mockConfig = {caprizaConfig: {}, systemConfig: "./mockConfig/systemConfig.json", controllerConfig: {}, blConfig: {},proxyUrl:"PROXY_URL"};
        var result = config.getConfiguration({logger: logger, mockConfig: mockConfig});
        expect(result).to.equal(mockConfig);
    });
});



