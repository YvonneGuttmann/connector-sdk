var fs = require('fs');
var mustache = require('mustache');

let packageJson = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let configJson = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
let moduleJsonTpl = fs.readFileSync(`module.json`, "utf8");
let view = {
  name: packageJson.name,
  version: packageJson.version,
  transformer: JSON.stringify(configJson.controllerConfig.schemaTransformer, null, 2).replace(/\n/g, "\\n"),
  fingerprint: JSON.stringify(configJson.controllerConfig.actionFingerprint, null, 2).replace(/\n/g, "\\n"),
  blConfig: JSON.stringify(configJson.blConfig, null, 2).replace(/\n/g, "\\n")
}

let moduleJson = mustache.render(moduleJsonTpl, view);
fs.writeFileSync(`module.json`, moduleJson);
