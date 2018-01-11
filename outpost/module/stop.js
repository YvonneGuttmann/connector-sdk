try {
  var config = require("./rtgwconfig.json");
} catch (e) {
  outpost.log("rtgwconfig.json file missing. nothing to do.");
  outpost.done();
  return;
}

outpost.log(`stopping ${config.name}`);

outpost.unmonitor({ name: config.name }, function(err) {
  if (err) {
    return outpost.fail(config.name + " failed to stop: " + err);
  }
  outpost.script("logstash", null, function(err) {
    if (err) {
      outpost.fail("failed to stop logstash: " + err);
      return;
    }
    outpost.done();
  });
});
