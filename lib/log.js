var fs = require ('fs');
var pino = require('pino');
var path = require ('path');
var logrotate = require('logrotator');
const LOG_PATH = "log";

var Logger = exports.Logger = class Logger{
    constructor(output, fileName = 'main.log') {
        try {
            this.output = output;
            this.logFile = path.join(LOG_PATH, fileName);
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
	
	static createLogDir(dir, logger) {
		dir = path.join(LOG_PATH, dir);
		fs.mkdirSync(dir);
		var bindings = logger ? Logger.getLoggerBindings(logger) : {};
		var logFile = path.join(dir, "main.log");
		var stream = fs.createWriteStream(logFile, { flags: 'a' });
		var logger = pino(Object.assign({timestamp: pino.stdTimeFunctions.slowTime}, bindings), stream);
		logger.log = logger.info;
		logger.caprizaStream = stream;
		logger.caprizaLogFile = logFile;
		return logger;
	}
	
	static duplicate(logger, fileName) {
		var bindings = Logger.getLoggerBindings(logger);
		var logFile = path.join(path.dirname(logger.caprizaLogFile), fileName);
		var stream = fs.createWriteStream(logFile, { flags: 'a' });
		var logger = pino(Object.assign({timestamp: pino.stdTimeFunctions.slowTime}, bindings), stream);
		logger.log = logger.info;
		logger.caprizaStream = stream;
		logger.caprizaLogFile = logFile;
		return logger;		
	}
	
    create(data){
        if (this.output == "console") Object.assign (data, {prettyPrint : true});
        var logger = pino (Object.assign ({timestamp: pino.stdTimeFunctions.slowTime}, data), this.stream);
        logger.log = logger.info;
		logger.caprizaLogFile = this.logFile;
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
