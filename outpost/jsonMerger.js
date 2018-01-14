var fs = require('fs');
var merge = require('deepmerge');
var fileA = process.argv[2];
var fileB = process.argv[3];
var fileOut = process.argv[4];
fs.writeFileSync(fileOut, JSON.stringify(merge(require(fileA), require(fileB))));
