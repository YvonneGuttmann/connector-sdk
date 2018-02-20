var fs = require('fs');
var mustache = require('mustache');

let packageJson = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let configJson = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
let moduleJsonTpl = fs.readFileSync(`module.json`, "utf8");

let controllerConfig = configJson.controllerConfig;
let blConfig = configJson.blConfig;

packageJson.version = packageJson.version || "1.0.0";
let [verMajor, verMinor, patch] = packageJson.version.split(".");
let [verPatch, verTag] = (patch || "").split("-");
let view = {
  name: packageJson.name,
  version: packageJson.version,
  verMajor: parseInt(verMajor || "1"),
  verMinor: parseInt(verMinor || "0"),
  verPatch: parseInt(verPatch || "0"),
  verTag: verTag || "",
  author: packageJson.author || "capriza",
  controllerConfig: controllerConfig ? JSON.stringify(JSON.stringify(controllerConfig, null, 2)) : undefined,
  blConfig: blConfig ? JSON.stringify(JSON.stringify(blConfig, null, 2)) : undefined
}

let moduleJson = mustache.render(moduleJsonTpl, view);
fs.writeFileSync(`module.json`, moduleJson);
