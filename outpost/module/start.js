const util = require("util");
const fs = require ("fs");
var {name, version} = require ("./module.json");

name = `${name}@${version}`;
// outpost.script("logstash", null, function(err) {
//   if (err) {
//     outpost.fail("failed to start logstash: " + err);
//     return;
//   }

  outpost.log(`Starting connector ${name}`);

  try {
    var prefix = "./connector/node_modules/.bin/.prestart";
    var files = fs.readdirSync(prefix);
    var origLogger = outpost.log;
    files.forEach (file => {
      try {
          outpost.log = msg => origLogger(`[${file}] ${msg}`);
          require(`${prefix}/${file}`);
      }
      catch (ex){
          throw new Error (`Error running prestart script ${prefix}/${file}): ${ex.message}`);
      }
      finally {
          outpost.log = origLogger;
      }
    });

  }
  catch (ex){
    if (ex.code !== "ENOENT"){
        outpost.fail (`Error running prestart scripts: ${ex.message}`);
        return;
    }
  }

  process.env["CONTROLLER_TITLE"] = name;

  outpost.monitor({ name , cmd: "./node", cwd: "connector", args: ["node_modules/connector-controller/start.js"], env: process.env }, function(err) {
    if (err) {
      outpost.fail(name + " failed to start: " + err);
    } else {
      outpost.log(name + " started");
      outpost.done();
    }
  });
// });
