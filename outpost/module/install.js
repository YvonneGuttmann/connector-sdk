const fs = require("fs");
fs.writeFileSync("connector/resources/_vanilla.json", fs.readFileSync("connector/resources/config.json"));
outpost.done();