const fs = require("fs");
const url = require("url");

let vanilla = require("./connector/resources/_vanilla.json");
let blConfig = (outpost.config.blConfig || "").trim();
let parsed = url.parse(outpost.opconfig.remote);
let apiUrl = url.format({protocol: parsed.protocol, hostname: parsed.hostname, port: parsed.port, pathname: "/v1"})
let [apiKey, apiSecret] = outpost.opconfig.auth.split(":");

let controllerConfig = (outpost.config.controllerConfig || "").trim();

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
  controllerConfig: (!outpost.config.useVanillaConfig && controllerConfig) ? JSON.parse(controllerConfig) : (vanilla.controllerConfig || {}),
  blConfig: (!outpost.config.useVanillaConfig && blConfig) ? JSON.parse(blConfig) : (vanilla.blConfig || {})
}
fs.writeFileSync("connector/resources/config.json", JSON.stringify(config, null, 2));

outpost.done();
