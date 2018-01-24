var {name, version} = require ("./module.json");
name = `${name}@${version}`;
outpost.log(`stopping ${name}`);

outpost.unmonitor({ name }, function(err) {
  if (err) {
    return outpost.fail(name + " failed to stop: " + err);
  }
  // outpost.script("logstash", null, function(err) {
  //   if (err) {
  //     outpost.fail("failed to stop logstash: " + err);
  //     return;
  //   }
    outpost.done();
  // });
});
