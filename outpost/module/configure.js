/*const fs = require("fs");
var url = require ("url");
var server = url.parse(outpost.opconfig.remote);
var config = {
    controllerConfig: {
        apiUrl: server.href.replace(server.path, ""),
        creds: outpost.config.controllerConfig.creds
    }
}
fs.writeFileSync("connector/config.json", JSON.stringify(config, null, 2));*/
outpost.done();
