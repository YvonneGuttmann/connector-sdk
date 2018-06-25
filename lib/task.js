var Errors = require('./errors');
var Logger = require ("./log").Logger; 

const defaultConfig = {
	taskTimeout				: 30 * 60 * 1000,		// 30 min,
	taskProgressInterval	: 30 * 1000				// 30 sec
};

module.exports = function({ handlers, config, backendFactory, Connector, logger }) {
	config = Object.assign({}, defaultConfig, config);
	
	class Task {
		constructor(data) {
			this.data = data;
			this.id = data.id;
			
			logger.log(`Creating task: ${data.type}. id=${data.id}`);
			var log = process.env.logStream == "file" ? Logger.createLogDir(`${data.type}-${data.id}`, logger) : logger;
			this.logger = log.child({ type : data.type, id : data.id });			
			
			this.connector = new Connector({ logger : this.logger });
            this.backend = backendFactory(config, this.logger);
			
			if (config.captureFlow) this.captureFlow();
		}
		
		async execute() {
			var taskType = this.data.type, taskError;
			this.logger.log(`Performing task '${this.id}' of type '${this.data.type}'`);
			this.logger.__task__ = { taskType : this.data.type, taskId : this.id };
			
			try {
				this._updateTaskInProgress();
				var taskFunc = handlers[taskType];
				if (!taskFunc && !taskType.startsWith('action$')) {
					var error =  new Error(`Unknown task type ${taskType}`);
					error.error = `TASK_INVALID`;
					throw error;				
				}

				if(taskType.startsWith('action$')) taskFunc = handlers['additionalActions'];
				
				await Promise.race([ taskFunc.call(this), this._taskTimeout() ]);
			} catch (err){
				this.logger.error(err.error ? Errors.get(err.error) : undefined, `performTask failed. taskId ${this.id}. Error: ${err.stack || err}`);
				taskError = err;
				if (this._updatingProgressTimer) clearInterval(this._updatingProgressTimer);

				if (err.approvalSyncResult) {
					this.logger.debug("Sending updated approval after failed action");
					await this.backend.sendApprovals({approvals: err.approvalSyncResult}, { logger : this.logger });
				}
			}

			this.logger.info((taskError && taskError.error) ? Errors.get(taskError.error) : undefined), `Task ${this.id} of type ${taskType} ended ${(!taskError ? "successfully" : `with error ${taskError.message}`)}`;
			if (this._updatingProgressTimer) clearInterval(this._updatingProgressTimer);
			return this._updateTask({succeeded: !taskError, payload: (taskError && taskError.error) ? Errors.get(taskError.error) : taskError});
		}
		
		async abort() {
			this.logger.log(`Terminating task ${this.id} of type ${this.data.type}`);
			return this._updateTask({ succeeded : false });
		}

		captureFlow() {
			var Flow = require("../test/SDKTasks/utils/Flow.js");
			this.flow = new Flow({});
			this.flow.capture(this.backend);
			this.flow.capture(this.connector.BL);
		}
		
		async _updateTask(data) {
			var res = await this.backend.updateTask(this.id, data);
			
			if (this.flow) {
				var data = {
					title	: "Recorded flow",
					task	: this.data.type,
					steps	: this.flow.steps
				};
				
				var path = require("path"), fs = require("fs");
				var flowFile = process.env.logStream == "file" ?
					path.join(path.dirname(this.logger.caprizaLogFile), "flow.json") :
					path.join("log", `${this.data.type}-${this.id}-flow.json`);
					
				fs.writeFile(flowFile, JSON.stringify(data), err => {});
			}
			
            return res;
		}
		
		_updateTaskInProgress() {
			var attempts = 1;
			this._updatingProgressTimer = setInterval(async () => {
				this.logger.info(`Updating progress of task '${this.id}', attempt: ${attempts}`);
				try {
					return await this.backend.updateTaskInProgress(this.id);
				} catch (ex) {
					this.logger.error(`Failed to update progress on task '${this.id}': ${ex.message}, attempt: ${attempts++}`);
					if (attempts >= 3) {
						this.logger.info(`Stopping to update progress on task '${this.id}' after ${attempts} attempts`);
						clearInterval(this._updatingProgressTimer);
						this._updatingProgressTimer = undefined;
					}
				}
			}, config.taskProgressInterval);
		}
		
		_taskTimeout() {
			return new Promise((resolve, reject) => {
				this.logger.debug(`Starting task timeout: ${config.taskTimeout} ms`);
				setTimeout(() => {
					var error = new Error("Task timeout reached");
					error.error = "TASK_TIMEOUT";
					reject(error);
				}, config.taskTimeout);
			});
		}
	};

	class InternalTask extends Task {
		_updateTaskInProgress() {}
        _updateTask() {}
	};
	
	return { Task, InternalTask };
};
