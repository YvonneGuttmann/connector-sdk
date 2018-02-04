const fs = require("fs");

let vanilla = require("connector/resources/_vanilla.json");
let transformer = (outpost.config.transformer || "").trim();
let fingerprint = (outpost.config.fingerprint || "").trim();
let blConfig = (outpost.config.blConfig || "").trim();

let config = {
  caprizaConfig: outpost.config.caprizaConfig,
  systemConfig: outpost.config.systemConfig,
  controllerConfig: {
    schemaTransformer: transformer ? JSON.parse(transformer) : vanilla.controllerConfig.schemaTransformer,
    actionFingerprint: fingerprint ? JSON.parse(fingerprint) : vanilla.controllerConfig.actionFingerprint
  }, 
  blConfig: blConfig ? JSON.parse(blConfig) : vanilla.blConfig
}
fs.writeFileSync("connector/resources/config.json", JSON.stringify(config, null, 2));

outpost.done();
