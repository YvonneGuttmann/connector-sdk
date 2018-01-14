var validate = require('capriza-schema').validate;
var http = require('http');
var fs = require('fs');
var consoleCacher = [], consoleCacherSentIndex = 0;
var logger = require ("pino")({prettyPrint:true});
logger.log = logger.info;
logger.level = 'trace';
var jslt = require ("jslt");
var argv = require('minimist')(process.argv.slice(2));
var config = require (`../../../dev-configs/${argv.bl}.json`);
var template = config.jslt;
var jslt = new (require ("jslt"))(template);
jslt.setTemplate(template);
var old_write = process.stdout.write;

process.stdout.write = (function(write) {
    return function(string, encoding, fd) {
        write.apply(process.stdout, arguments)
        consoleCacher.push(string);
    }
})(process.stdout.write)

process.on('uncaughtException', function(error) {
    logger.error(error);
});

const PORT=8080;

fs.readFile('./index.html', function (err, html) {

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
                return bl.fetch({logger})
                    .then(data => {
                        if (template) return data.map(rawApproval => jslt.transform(rawApproval));
                        return data;
                    })
                    .then (data => {
                        let validationResult;
                        for (i in data) {
                            var approval = data[i];
                            if (!approval.schemaId) {
                                validationResult = {errors: [{error: `approval ${approval.private.id} has no schemaId:\n${JSON.stringify()}`}]};
                                break;
                            }
                            validationResult = validate(approval, approval.schemaId);
                            if (validationResult.errors.length > 0) break;
                        }
                        res.write(JSON.stringify({data, validationResult}));
                        return res.end();
                    })
                    .catch (err => {
                        res.write(JSON.stringify(err));
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
                        if (template) return jslt.transform(data);
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
        }
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
    }).listen(PORT);

    server.timeout = 15 * 60 * 1000;

    var opn = require('opn');

    opn('http://localhost:8080');
});

module.exports = {
    registerActions(inputActions){
        bl = inputActions;
    },

    async initBL(){
        await bl.init({config, logger});
    }
};