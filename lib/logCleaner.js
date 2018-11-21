
const fs = require("fs"), path = require("path");

var LogCleaner = module.exports = class {
	constructor(dir, config, logger) {
		this.path = dir;
		this.cfg = config || {};
		this.cfg.hours = this.cfg.hours || 48;
		this.cfg.size = (this.cfg.size || 10) * 1024 * 1024;
		this.removeFunc = remove;
		this.logger = logger || console;
	}
	
	clean() {
		return new Promise((resolve, reject) => {
			fs.readdir(this.path, async (err, filenames) => {
				if (err) return;
				
				var filesCount = filenames.length;
				var ignoreRE = this.cfg.ignoreFilesRE;
				if (ignoreRE) filenames = filenames.filter(f => !ignoreRE.test(f));
				
				var files = await Promise.all(filenames.map(f => getStats(path.join(this.path, f))));
				files.sort((a,b) => a.modified - b.modified);
				
				var totalSize = files.reduce((sum, cur) => sum + cur.size, 0);
				var maxDate = Date.now() - 3600000 * this.cfg.hours;
				var afterSize = totalSize;
				
				for (var i = 0; i < files.length; ++i) {
					var file = files[i];
					if (file.modified >= maxDate && afterSize <= this.cfg.size) break;
					afterSize -= file.size;
				}

				this.logger.log(`Clean stats (${this.path}): all=${filesCount} checked=${files.length} deleted=${i} size=${(totalSize/1024).toFixed(2)}KB -> ${(afterSize/1024).toFixed(2)}KB`);
				await Promise.all(files.slice(0, i).map(f => this.removeFunc(f.name)));
				resolve();
			});
		});
	}
	
	startMonitor(interval = 30) {
		this.logger.log(`Started monitoring ${this.path}. interval=${interval} minutes`);
		this.stopMonitor();
		this._timer = setInterval(() => this.clean(), interval * 60000);
	}
	
	stopMonitor() {
		if (this._timer !== undefined) {
			clearInterval(this._timer);
			this._timer = undefined;
		}
	}
	
	static cleanPath(dir, props) {
		var lc = new LogCleaner(dir, props);
		return lc.clean();
	}
};

function getStats(filepath) {
	return new Promise((resolve, reject) =>  {
		fs.stat(filepath, (err, stats) => {
			if (err) return resolve({ name : filepath, size : 0, modified : 0 });
			if (!stats.isDirectory()) return resolve({ name : filepath, size : stats.size, modified : stats.mtimeMs });
						
			fs.readdir(filepath, (err, filenames) => {
				Promise.all(filenames.map(f => getStats(path.join(filepath, f))))
					.then(res => resolve({ name : filepath, size : res.reduce((sum, cur) => sum + cur.size, 0), modified : stats.mtimeMs, directory : true }))
					.catch(reject);
			});
		});
	});
}

function remove(delPath) {
	return new Promise((resolve, reject) => {
		fs.stat(delPath, (err, stats) => {
			if (err) resolve(false);
			else if (stats.isDirectory()) {
				fs.readdir(delPath, (err, filenames) => {
					if (err) return resolve(false);
					Promise.all(filenames.map(f => remove(path.join(delPath, f))))
						.then(() => { fs.rmdir(delPath, err => resolve()); })
						.catch(reject)
				});
			} else fs.unlink(delPath, resolve);
		});
	});
}
