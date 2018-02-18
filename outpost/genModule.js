var fs = require('fs');
var mustache = require('mustache');

let packageJson = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let configJson = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
let moduleJsonTpl = fs.readFileSync(`module.json`, "utf8");

let controllerConfig = configJson.controllerConfig;
let blConfig = configJson.blConfig;

let view = {
  name: packageJson.name,
  version: packageJson.version,
  controllerConfig: controllerConfig ? JSON.stringify(JSON.stringify(controllerConfig, null, 2)) : undefined,
  blConfig: blConfig ? JSON.stringify(JSON.stringify(blConfig, null, 2)) : undefined
}

let moduleJson = mustache.render(moduleJsonTpl, view);
fs.writeFileSync(`module.json`, moduleJson);
