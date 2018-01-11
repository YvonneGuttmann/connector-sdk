const util = require("util");

try {
  var config = require("./config.json");
} catch (e) {
  return outpost.fail("rtgwconfig.json file does not exist");
}

outpost.script("logstash", null, function(err) {
  if (err) {
    outpost.fail("failed to start logstash: " + err);
    return;
  }

  outpost.log(`Starting connector ${config.connectorName}`);

  outpost.monitor({ name: config.connectorName, cmd: "./node", args: ["index.js"] }, function(err) {
    if (err) {
      outpost.fail(config.connectorName + " failed to start: " + err);
    } else {
      outpost.log(config.connectorName + " started");
      outpost.done();
    }
  });
});
