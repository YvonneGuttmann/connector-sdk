const archiver = require('archiver');
const path = require("path");
const fs = require("fs");

module.exports = {
    archiveLogs(logFiles, feedbackName) {
        return new Promise(resolve => {
            var zipPath = path.join("log", `${feedbackName}.zip`);
            var output = fs.createWriteStream(zipPath);
            output.on("close", function () {
                resolve(zipPath);
            });
            var archive = archiver("zip", {zlib: {level: 9}});
            archive.pipe(output);
            logFiles.forEach((logfile => {
                archive.directory(logfile.path, logfile.name);
            }));
            archive.finalize();
        });
    }
};