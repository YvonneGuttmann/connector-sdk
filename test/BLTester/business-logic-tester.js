const chokidar = require('chokidar');
const server = require("./server.js");

function init() {
    var bl = require (`${process.cwd()}`);
    server.registerActions(bl);
    server.initBL();
    try{
        var schema = require (`${process.cwd()}/resources/schema.json`);
        server.registerSchema(schema);
    } catch(ex) { }

}

init();

console.log(`Start watching files`);
const watcher = chokidar.watch(`${process.cwd()}/**`, {
    ignoreInitial: true,
});

watcher.on('change', (event, filename) => {
    console.log(`File ${filename} reloading connector`);
    Object.keys(require.cache).forEach(key=>delete require.cache[key]);
    init();
});
