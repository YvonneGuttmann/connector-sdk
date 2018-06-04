var validate = require('@capriza/schemas').validate;
var registerSchema = require('@capriza/schemas').registerSchema;
var http = require('http');
var fs = require('fs');
var consoleCacher = [], consoleCacherSentIndex = 0;
var logger = require ("pino")({prettyPrint:true});
logger.log = logger.info;
logger.level = 'trace';
var argv = require('minimist')(process.argv.slice(2));
var path = require ("path");
var blName = process.cwd().substring(Math.max(process.cwd().lastIndexOf("/") + 1, process.cwd().lastIndexOf("\\") + 1));
var config = require ("../../lib/config").getConfiguration({logger});
//var template = config.controllerConfig.schemaTransformer;
// var jslt = new (require ("jslt"))(template);
//jslt.setTemplate(template);
const jslt = require('jslt');
var old_write = process.stdout.write;
var signatureList = [];
var transformer;

process.stdout.write = (function(write) {
    return function(string, encoding, fd) {
        write.apply(process.stdout, arguments)
        consoleCacher.push(string);
    }
})(process.stdout.write)

process.on('uncaughtException', function(error) {
    logger.error(error);
});

process.on("SIGINT", async() => {
    if (this.exit) return;
    this.exit = true;
    await bl.stop();
    process.exit();
});

const PORT=8080;

fs.readFile(`${path.resolve(__dirname)}/index.html`, function (err, html) {

    if (err) throw err;

    var routes = {
        "/": function (req, res){
            res.writeHeader(200, {"Content-Type": "text/html"});
            res.write(html);
            res.end();
        },
        "/fetchData": function (req, res){
            res.writeHeader(200, {"Content-Type": "text/html"});
            if ("fetch" in bl){
                return bl.fetch({logger, signatureList:signatureList})
                    .then(data => {
                        if(data.approvals){
                            data = data.approvals;
                        }
                        if (transformer) return data.map(rawApproval => {
                            if (rawApproval.error) return rawApproval;
                            return transformer(rawApproval)
                        });
                        return data;
                    })
                    .then (data => {
                        let validationResult;
                        let nonExistingSchemas;
                        for (i in data) {
                            var approval = data[i];
                            if (!approval.error && !(argv["schema-validation"] == false)) {
                                if (!approval.schemaId) {
                                    validationResult = {errors: [{error: `approval ${approval.private.id} has no schemaId:\n${JSON.stringify()}`}]};
                                    break;
                                }

                                try {
                                    validationResult = validate(JSON.parse(JSON.stringify(approval)), approval.schemaId);
                                    if (validationResult.errors.length > 0) break;
                                } catch (ex) {
                                    if(!nonExistingSchemas) nonExistingSchemas = {};
                                    nonExistingSchemas[approval.schemaId] = true;
                                }
                            }
                        }
                        signatureList = data.map(approval => {return {private: approval.private}});
                        res.write(JSON.stringify({data, validationResult, nonExistingSchemas}));
                        return res.end();
                    })
                    .catch (err => {
                        res.write(JSON.stringify({data: [], validationResult: {errors: [{error: err ? err.stack || err : ""}]}}));
                        return res.end();
                    });
            }
            res.write("{'success': 'false'}");
            res.end();
        },
        "/quickFetchData": function (req, res){
            res.writeHeader(200, {"Content-Type": "text/html"});
            if ("fetch" in bl){
                return bl.fetch({logger, fetchType:"partial", signatureList:signatureList})
                    .then(data => {
                        if(data.partialSync){
                            data = data.approvals;
                        }
                        if (transformer) return data.map(rawApproval => {
                            if (rawApproval.error) return rawApproval;
                            return transformer(rawApproval)
                        });
                        return data;
                    })
                    .then (data => {
                        let validationResult;
                        for (i in data) {
                            var approval = data[i];
                            if (!approval.error) {
                                if (!approval.schemaId) {
                                    validationResult = {errors: [{error: `approval ${approval.private.id} has no schemaId:\n${JSON.stringify()}`}]};
                                    break;
                                }
                                validationResult = validate(JSON.parse(JSON.stringify(approval)), approval.schemaId);
                                if (validationResult.errors.length > 0) break;
                            }

                        }
                        res.write(JSON.stringify({data, validationResult}));
                        return res.end();
                    })
                    .catch (err => {
                        res.write(JSON.stringify({data: [], validationResult: {errors: [{error: err ? err.stack || err : ""}]}}));
                        return res.end();
                    });
            }
            res.write("{'success': 'false'}");
            res.end();
        },
        "/getApproval": function (req, res){
            res.writeHeader(200, {"Content-Type": "text/html"});
            if ("getApproval" in bl){
                return bl.getApproval(JSON.parse(req.body), {logger})
                    .then(data => {
                        if (transformer) return transformer(data);
                        return data;
                    })
                    .then(data => {
                        res.write(JSON.stringify(data));
                        return res.end();
                    })
                    .catch (err => {
                        res.write(`Error - ${err.message}`);
                        return res.end();
                    });
            }
            res.write("{'success': 'false'}");
            res.end();
        },
        "/approve": function (req, res){
            res.writeHeader(200, {"Content-Type": "text/html"});
            if ("approve" in bl){
                return bl.approve(JSON.parse(req.body), {logger})
                    .then(data => {
                        res.write(JSON.stringify(data));
                        return res.end();
                    })
                    .catch (err => {
                        res.write(`Error - ${err.message}`);
                        return res.end();
                    });
            }
            res.write("{'success': 'false'}");
            res.end();
        },
        "/reject": function(req, res){
            res.writeHeader(200, {"Content-Type": "text/html"});
            if ("reject" in bl){
                return bl.reject(JSON.parse(req.body), {logger})
                    .then(data => {
                        res.write(JSON.stringify(data));
                        return res.end();
                    })
                    .catch (err => {
                        res.write(`Error - ${err.message}`);
                        return res.end();
                    });
            }
            res.write("{'success': 'false'}");
            res.end();
        },
        "/downloadAttachment": function(req, res){
            res.writeHeader(200, {"Content-Type": "text/html"});
            if ("downloadAttachment" in bl){
                return bl.downloadAttachment(JSON.parse(req.body), {logger})
                    .then(data => {
                        res.write(JSON.stringify(data));
                        return res.end();
                    })
                    .catch (err => {
                        res.write(`Error - ${err.message}`);
                        return res.end();
                    });
            }
            res.write("{'success': 'false'}");
            res.end();
        },
        "/getConsoleLog": function (req, res){
            res.writeHeader(200, {"Content-Type": "text/html"});
            res.write(JSON.stringify(consoleCacher.slice(consoleCacherSentIndex)));
            consoleCacherSentIndex = consoleCacher.length ? consoleCacher.length : consoleCacher.length - 1;
            res.end();
        },
        "/authenticate": function (req, res){
            res.writeHeader(200, {"Content-Type": "text/html"});
            if ("authenticate" in bl){
                return bl.authenticate(JSON.parse(req.body), {logger})
                    .then(data => {
                        if(data){
                            res.write(`Success`);
                        }
                        else {
                            res.write(`Failed`);
                        }
                        return res.end();
                    })
                    .catch (err => {
                        res.write(`Error - ${err.message}`);
                        return res.end();
                    });
            }
            res.write("authenticate() function is unimplemented");
            res.end();
        },
        "/registerSchema": function (req, res){
            res.writeHeader(200, {"Content-Type": "text/html"});
            var params = JSON.parse(req.body),
                schema = require(params.filePath);

            registerSchema(schema);
            res.write(`Schema ${schema.id} was registered successfully`);
            res.end();
        },
    }

    function getBody(req, res) {
        return new Promise (resolve => {
            function onData(chunk) {
                if (typeof chunk === 'string') chunk = new Buffer(chunk);
                body.push(chunk);
            }

            function onEnd(chunk) {
                if (chunk) onData(chunk);
                req.body = Buffer.concat(body).toString();
                resolve();
            }
            var body = [];

            req.on("data", onData);
            req.on("end", onEnd);
        });

    }

    var server = http.createServer(function(request, response) {
        if (request.url != "/getConsoleLog") console.log ("received request in route: " + request.url);
        if (request.url in routes) {
            getBody(request, response)
                .then (res => routes[request.url](request, response));

        }
    });
    var WS = require("ws");
    new WS.Server({server: server}).on("connection", () => { logger.info("BLTester connected")});
    server.listen(PORT);

    server.timeout = 15 * 60 * 1000;

    var opn = require('opn');

    opn('http://localhost:8080');
});

module.exports = {
    registerActions(inputActions){
        bl = inputActions;
    },

    registerSchema(schema){
        registerSchema(schema);
        logger.log(`Schema ${schema.id} was registered successfully`)
    },

    async initBL(){
        config = require ("../../lib/config").getConfiguration({logger});

        if(config.controllerConfig.schemaTransformer) {
            transformer = ((approval) => jslt.transform(approval, config.controllerConfig.schemaTransformer));
        }

        if(!transformer) {
            try {
                const transformerFile = require(`${process.cwd()}/resources/transformer.js`);
                if (transformerFile && typeof transformerFile === "object") {
                    transformer = ((approval) => jslt.transform(approval, transformerFile));
                } else if (transformerFile && typeof transformerFile === "function") {
                    transformer = transformerFile;
                }
            } catch (ex) {}
        }

        await bl.init({config: config.blConfig, logger});
    },

    async stopBL() {
        await bl.stop();
    }
};