var fs = require('fs');
var merge = require('deepmerge');
var fileA = process.argv[2];
var fileB = process.argv[3];
var fileOut = process.argv[4];
var pkg = JSON.parse(fs.readFileSync(fileB));
var merged = merge(JSON.parse(fs.readFileSync(fileA)), {name: pkg.name, version: pkg.version});
fs.writeFileSync(fileOut, JSON.stringify(merged, null, 2));
