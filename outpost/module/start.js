const util = require("util");
var {name, version} = require ("./module.json");

name = `${name}@${version}`;
// outpost.script("logstash", null, function(err) {
//   if (err) {
//     outpost.fail("failed to start logstash: " + err);
//     return;
//   }

  outpost.log(`Starting connector ${name}`);

  outpost.monitor({ name , cmd: "./node", args: ["connector/node_modules/connector-controller/start.js"] }, function(err) {
    if (err) {
      outpost.fail(name + " failed to start: " + err);
    } else {
      outpost.log(name + " started");
      outpost.done();
    }
  });
// });
