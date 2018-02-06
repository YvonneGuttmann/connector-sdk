var fs = require('fs');
var mustache = require('mustache');

let packageJson = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let configJson = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
let moduleJsonTpl = fs.readFileSync(`module.json`, "utf8");

let transformer = configJson.controllerConfig.schemaTransformer;
let fingerprint = configJson.controllerConfig.actionFingerprint;
let blConfig = configJson.blConfig;

let view = {
  name: packageJson.name,
  version: packageJson.version,
  transformer: transformer ? JSON.stringify(JSON.stringify(transformer, null, 2)) : undefined,
  fingerprint: fingerprint ? JSON.stringify(JSON.stringify(fingerprint, null, 2)) : undefined,
  blConfig: blConfig ? JSON.stringify(JSON.stringify(blConfig, null, 2)) : undefined
}

let moduleJson = mustache.render(moduleJsonTpl, view);
fs.writeFileSync(`module.json`, moduleJson);
