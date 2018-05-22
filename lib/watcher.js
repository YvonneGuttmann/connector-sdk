'use strict'
const chokidar = require('chokidar');
var watcher;

function getWatcher(){
    if (watcher){
        return watcher;
    }

    watcher = chokidar.watch(`${process.cwd()}/**`, {
        ignoreInitial: true,
        ignored: /log/
    });

    return watcher;
}

module.exports = (callback)=>{
    getWatcher().on('change', (event, filename) => {
        console.log(`File ${filename} changed reloading connector`);
        Object.keys(require.cache).forEach(key=>delete require.cache[key]);
        callback();
    });
};