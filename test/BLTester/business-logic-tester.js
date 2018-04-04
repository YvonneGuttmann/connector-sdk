var fse = require ("fs-extra");
var argv = require('minimist')(process.argv.slice(2));
var log = msg => console.log(`[Business-Logic-Tester] ${msg}`);

//var blPath = `../../../business-logic/${argv.bl}`;
//fse.copySync(`${blPath}/resources.json`, "../../resources.json");
var bl = require (`${process.cwd()}`);

var server = require("./server.js");
server.registerActions(bl);
server.initBL();
try{
    var schema = require (`${process.cwd()}/resources/schema.json`);
    server.registerSchema(schema);
} catch(ex) { }
