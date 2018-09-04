var fs = require ('fs');
var pino = require('pino');
var path = require ('path');
var logrotate = require('logrotator');
const LOG_PATH = "log";

var Logger = exports.Logger = class Logger {
    constructor({ consoleMode, fileMode, fileName, chindings, stream }) {
		this._consoleMode = consoleMode;
		this._fileMode = fileMode;
		this._chindings = chindings || {};
		
		if (consoleMode == "json")
			this._console = pino(Object.assign({timestamp: pino.stdTimeFunctions.slowTime}, chindings));
		else if (consoleMode == "text")
			this._console = console;

		if (fileMode) {
			if (stream) {
				this._stream = stream;
				this._fileName = fileName;
			} else {
				this._fileName = fileName || path.join(LOG_PATH, "main.log");
				var dirname = path.dirname(this._fileName);
				if (!fs.existsSync(dirname)) fs.mkdirSync(dirname);
				this._stream = fs.createWriteStream(this._fileName, { flags: 'a' });
				
				if (fileMode == "json")
					this._logger = pino(Object.assign({timestamp: pino.stdTimeFunctions.slowTime}, chindings), this._stream);
			}
		}
    }
	
	destroy() {
		if (this._stream) this._stream.end();
	}
	
	error(msg) {
		var textMsg;
		if (this._consoleMode == "json")
			this._console.error(...arguments);
		else if (this._consoleMode == "text")
			this._console.error(textMsg = `${getTimestamp()} INFO  - ${msg}`);
					
		if (this._logger)
			this._logger.error(...arguments);
		else if (this._stream)
			this._stream.write(textMsg ? textMsg + "\r\n" : `${getTimestamp()} ERROR - ${msg}\r\n`);
	}
	
	info(msg) {
		var textMsg;
		if (this._consoleMode == "json")
			this._console.info(...arguments);
		else if (this._consoleMode == "text")
			this._console.info(textMsg = `${getTimestamp()} INFO  - ${msg}`);
					
		if (this._logger)
			this._logger.info(...arguments);
		else if (this._stream)
			this._stream.write(textMsg ? textMsg + "\r\n" : `${getTimestamp()} INFO  - ${msg}\r\n`);
	}
	
	log(msg) {
		return this.info(msg);
	}

	debug(msg) {
		var textMsg;
		if (this._consoleMode == "json")
			this._console.debug(...arguments);
		else if (this._consoleMode == "text")
			this._console.debug(textMsg = `${getTimestamp()} INFO  - ${msg}`);
					
		if (this._logger)
			this._logger.debug(...arguments);
		else if (this._stream)
			this._stream.write(textMsg ? textMsg + "\r\n" : `${getTimestamp()} DEBUG - ${msg}\r\n`);
	}
	
	child(chindings) {
		return new Logger({
			consoleMode : this._consoleMode,
			fileMode	: this._fileMode,
			fileName	: this._fileName,
			stream		: this._stream,
			chindings	: Object.assign({}, this._chindings, chindings)
		});
	}
		
	seperateFile(fileName, { fileMode, consoleMode } = {}) {
		return new Logger({
			consoleMode : consoleMode || this._consoleMode,
			fileMode	: fileMode || this._fileMode || "text",
			fileName	: path.join(this._fileName ? path.dirname(this._fileName) : LOG_PATH, fileName),
			chindings	: Object.assign({}, this._chindings)
		});
	}
	
    startLogRotation() {
		if (!this._fileName) return;
		
        var rotator = logrotate.rotator;

        // check file rotation every 5 minutes, and rotate the file if its size exceeds 10 mb.
        // keep only 3 rotated files and compress (gzip) them.
        rotator.register(this._fileName, {schedule: '5m', size: '10m', compress: true, count: 3});

        rotator.on('error', function(err) {
            console.log('Error rotating: ' + err.message);
        });

        // 'rotate' event is invoked whenever a registered file gets rotated
        rotator.on('rotate', function(file) {
            console.log('file ' + file + ' was rotated!');
        });
    }
}

function getTimestamp() {
	return (new Date()).toISOString().replace('T', ' ').replace('Z', '');
}
