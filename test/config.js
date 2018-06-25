var chai = require('chai');
var expect = chai.expect;
var config = require("../lib/config.js");

var Logger = require("../lib/log").Logger;
var loggerFactory = new Logger("console");
var logger = loggerFactory.create({component: "test/config.js"});


describe("load config file", function () {
    it("~1 Getting configuration path from env variable should return the config file", function (end) {
        process.env.CONNECTOR_CONFIG_PATH = "mockConfig.json";
        var mockConfig = {caprizaConfig:{},systemConfig:{},controllerConfig:{},blConfig:{}};
        var result = config.getConfiguration({logger: logger, mockConfig: mockConfig});
        delete process.env.CONNECTOR_CONFIG_PATH;
        expect(result).to.equal(mockConfig);
        end();
    });
    it("~2 Getting configuration path default path [./resources/config.json] should return the config file", function (end) {
        var mockConfig = {caprizaConfig: {}, systemConfig: {}, controllerConfig: {}, blConfig: {}};
        var result = config.getConfiguration({logger: logger, mockConfig: mockConfig});
        expect(result).to.equal(mockConfig);
        end();
    });
});

describe("parse config file", function(){
    it("~3 check when caprizaConfig is String, should return the config file", function (end) {
        var mockConfig = {caprizaConfig: "test/mockConfig/caprizaConfig.json", systemConfig: {}, controllerConfig: {}, blConfig: {}};
        var result = config.getConfiguration({logger: logger, mockConfig: mockConfig});
        expect(result).to.equal(mockConfig);
        end();
    });
    it("~4 check when systemConfig is String, should return the config file", function (end) {
        var mockConfig = {caprizaConfig: {}, systemConfig: "test/mockConfig/systemConfig.json", controllerConfig: {}, blConfig: {}};
        var result = config.getConfiguration({logger: logger, mockConfig: mockConfig});
        expect(result).to.equal(mockConfig);
        end();
    });
    it("~5 check when adding proxyUrl, should return the config file", function (end) {
        var mockConfig = {caprizaConfig: {}, systemConfig: "test/mockConfig/systemConfig.json", controllerConfig: {}, blConfig: {},proxyUrl:"PROXY_URL"};
        var result = config.getConfiguration({logger: logger, mockConfig: mockConfig});
        expect(result).to.equal(mockConfig);
        end();
    });
});



