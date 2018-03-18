var fs = require ('fs');
var pino = require('pino');
var path = require ('path');
var logrotate = require('logrotator');

exports.Logger = class Logger{
    constructor(output, fileName = 'main.log') {
        try {
            this.output = output;
            this.logFile = `log/${fileName}`;
            if (output == 'file') {
                var dirname = path.dirname(this.logFile);
                if (!fs.existsSync(dirname)) fs.mkdirSync(dirname);
                this.stream = fs.createWriteStream (this.logFile, { flags: 'a' });
            }
        }
        catch (err) {console.log (err.message)}
    }
    static getLoggerBindings(logger){
        try {
            return JSON.parse(`{${logger.chindings.substring(1)}}`);
        }
        catch (ex){
            logger.error ("Error fetching logger bindings");
            return {};
        }
    }
    create(data){
        if (this.output == "console") Object.assign (data, {prettyPrint : true});
        var logger = pino (Object.assign ({timestamp: pino.stdTimeFunctions.slowTime}, data), this.stream);
        logger.log = logger.info;
        this.startLogRotation();
        return logger;
    }
    startLogRotation (){
        var rotator = logrotate.rotator;

        // check file rotation every 5 minutes, and rotate the file if its size exceeds 10 mb.
        // keep only 3 rotated files and compress (gzip) them.
        rotator.register(this.logFile, {schedule: '5m', size: '10m', compress: true, count: 3});

        rotator.on('error', function(err) {
            console.log('Error rotating: ' + err.message);
        });

        // 'rotate' event is invoked whenever a registered file gets rotated
        rotator.on('rotate', function(file) {
            console.log('file ' + file + ' was rotated!');
        });
    }
}
