var fse = require ("fs-extra");
var argv = require('minimist')(process.argv.slice(2));
var log = msg => console.log(`[Business-Logic-Tester] ${msg}`);

if (argv.bl) {

    var blPath = `../../../business-logic/${argv.bl}`;
    //fse.copySync(`${blPath}/resources.json`, "../../resources.json");
    var bl = require (`${blPath}/index.js`);

    //1. make sure the bl exposes methods: "fetch, getApproval, approve, reject"
    var unimplementedActions = ["fetch", "getApproval", "approve", "reject"].filter (action => !Object.keys(bl).includes(action));
    if (unimplementedActions.length > 0)
        log (`Error - '${bl}' doesn't implemented: ${unimplementedActions}`);

    //2. start server
    var server = require("./server.js");
    server.registerActions(bl);
    server.initBL();
}

