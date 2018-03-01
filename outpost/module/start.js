const util = require("util");
const fs = require ("fs");
var {name, version} = require ("./module.json");


function readdirRecursive (dir) {
  return new Promise ((resolve,reject) => {
      var results = [];
      fs.readdir(dir, function(err, list) {
          if (err) return reject(err);
          var i = 0;
          (function next() {
              var file = list[i++];
              if (!file) return resolve(results);
              file = dir + '/' + file;
              fs.stat(file, async function(err, stat) {
                  if (stat && stat.isDirectory()) {
                      try {
                          var res = await readdirRecursive(file);
                          results = results.concat(res);
                          next();
                      } catch (ex) {return reject (ex);}
                  } else {
                      results.push(file);
                      next();
                  }
              });
          })();
      });
  });
}

(async function start () {
    name = `${name}@${version}`;
    outpost.log(`Starting connector ${name}`);

    try {
        var prefix = "./connector/node_modules/.bin/.prestart";
        var files = await readdirRecursive(prefix);
        var origLogger = outpost.log;
        files.forEach(file => {
            try {
                outpost.log = msg => origLogger(`[${file}] ${msg}`);
                require(file);
            }
            catch (ex) {
                throw new Error(`Error running prestart script ${file}: ${ex.message}`);
            }
            finally {
                outpost.log = origLogger;
            }
        });

    }
    catch (ex) {
        if (ex && ex.code != "ENOENT") {
            outpost.fail(`Error running prestart scripts: ${ex.message || ex}`);
            return;
        }
    }

    process.env["CONTROLLER_TITLE"] = name;

    outpost.monitor({
        name,
        cmd: "./node",
        cwd: "connector",
        args: ["node_modules/connector-controller/start.js"],
        env: process.env
    }, function (err) {
        if (err) {
            outpost.fail(name + " failed to start: " + err);
        } else {
            outpost.log(name + " started");
            outpost.done();
        }
    });
})();

// });
