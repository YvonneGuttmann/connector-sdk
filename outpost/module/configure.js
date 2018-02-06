const fs = require("fs");
const url = require("url");

let vanilla = require("./connector/resources/_vanilla.json");
let transformer = (outpost.config.transformer || "").trim();
let fingerprint = (outpost.config.fingerprint || "").trim();
let blConfig = (outpost.config.blConfig || "").trim();
let parsed = url.parse(outpost.opconfig.remote);
let apiUrl = url.format({protocol: parsed.protocol, hostname: parsed.hostname, port: parsed.port, pathname: "/v1"})
let [apiKey, apiSecret] = outpost.opconfig.auth.split(":");
let config = {
  caprizaConfig: {
    connectorId: outpost.config.connectorId,
    apiUrl: apiUrl,
    creds: {
      apiKey: apiKey,
      apiSecret: apiSecret
    }
  },
  systemConfig: outpost.config.systemConfig,
  controllerConfig: {
    schemaTransformer: transformer ? JSON.parse(transformer) : vanilla.controllerConfig.schemaTransformer,
    actionFingerprint: fingerprint ? JSON.parse(fingerprint) : vanilla.controllerConfig.actionFingerprint
  }, 
  blConfig: blConfig ? JSON.parse(blConfig) : vanilla.blConfig
}
fs.writeFileSync("connector/resources/config.json", JSON.stringify(config, null, 2));

outpost.done();
