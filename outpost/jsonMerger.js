var fs = require('fs');
var merge = require('deepmerge');
var fileA = process.argv[2];
var fileB = process.argv[3];
var fileOut = process.argv[4];
var merged = merge(JSON.parse(fs.readFileSync(fileA)), JSON.parse(fs.readFileSync(fileB)));
fs.writeFileSync(fileOut, JSON.stringify(merged, null, 2));
