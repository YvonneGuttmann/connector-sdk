const fs = require("fs");

fs.writeFileSync("config.json", JSON.stringify(outpost.config, null, 2));
outpost.done();
