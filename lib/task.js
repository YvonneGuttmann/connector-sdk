var Errors = require('./errors');
var Result = require('./Result');
var path = require("path");

const defaultConfig = {
	taskTimeout				: 30 * 60 * 1000,		// 30 min,
	taskProgressInterval	: 30 * 1000,			// 30 sec
	feedbackInterval        : 1000 * 60 * 60,       // 1 hour
	feedbackMax             : 10,                   //max 10 feedback per hour
    feedbackStatuses		: [ "Timeout", "InternalError", "NotImplemented" ]		// feedback will be sent automatically in those statuses by default
};

var feedbackCounter = 0;

module.exports = function({ handlers, config, backendFactory, Connector, logger }) {
	config = Object.assign({}, defaultConfig, config);

    setInterval(()=>{
        feedbackCounter = 0;
    }, config.feedbackInterval);

	class Task {
		constructor(data) {
			this.data = data;
			this.id = data.id;
			
			logger.log(`Creating task: ${data.type}. id=${data.id}`);
			
			var log = process.env.logStream == "file" ?
				logger.seperateFile(path.join(`${data.type}-${data.id}`, "main.log")) : logger;
						
			this.logger = log.child({ type : data.type, id : data.id });			
			this.logPath = log._fileName;
			this.connector = new Connector({ logger : this.logger , taskId: this.id});
            this.backend = backendFactory(config, this.logger);
			if (config.captureFlow) this.captureFlow();
		}
		
		async execute() {
			var taskType = this.data.type, taskResult;
			this.logger.log(`Performing task '${this.id}' of type '${this.data.type}'`);
			this.logger.__task__ = { taskType : this.data.type, taskId : this.id };
			try {
                this._updateTaskInProgress();
                var taskFunc = handlers[taskType];
                if (!taskFunc && !taskType.startsWith('action$')) {
                    this.logger.error(`Unknown task type: ${taskType}`);
                    taskResult = new Result.InternalError({}, { entity: "task", taskType, message: `Unknown task type` });
                } else {
                    if (taskType.startsWith('action$')) {
                    	taskFunc = handlers['additionalActions'];
                    }
                    taskResult = Result(await Promise.race([taskFunc.call(this), this._taskTimeout()]));
				}
            } catch (ex) {
				try {
                    var exceptionData = (ex && ex.stack) || JSON.stringify(ex);
				} catch (e) {
					exceptionData = "unspecified error";
				}
				this.logger.error(`Unexpected error: ${exceptionData}`);
				taskResult = new Result.InternalError({}, { entity: "task", taskType, message: `Unexpected error: ${exceptionData}` });
			}

            this.logger.info(`Task ${this.id} of type ${taskType} ended with status ${taskResult.status}.${taskResult.status !== 'Success' ?  "\nMore info:\n" + JSON.stringify(taskResult) : ""}`);

            if(!(taskResult.status instanceof Result.Success) && config.feedbackStatuses.includes(taskResult.status) && config.feedbackUrl && process.env.logStream === "file") {
                feedbackCounter++;
                if(feedbackCounter <= config.feedbackMax){
                    this.logger.info(`Sending feedback. Task result: ${JSON.stringify(taskResult)}`);
                    this._archiveLogs().then(zipPath => this.backend.sendFeedback(`${this.data.type}-${this.id}`, zipPath));
                }else{
                    this.logger.info(`more than ${config.feedbackMax} feedbacks at the last ${config.feedbackInterval} ms. not sending feedback.`)
                }
            }

            if (this._updatingProgressTimer) clearInterval(this._updatingProgressTimer);

            if(taskType === 'authenticate') {
                await this._updateTask({ succeeded: taskResult instanceof Result.Success && !(taskResult.data.authenticated === false), payload: Errors.getError(taskResult) });
            } else {
                await this._updateTask({ succeeded: taskResult instanceof Result.Success, payload: Errors.getError(taskResult) });
			}

            await this._destroy();
		}
		
		async abort() {
			this.logger.log(`Terminating task ${this.id} of type ${this.data.type}`);
			await this._updateTask({ succeeded : false });
			await this._destroy();
		}

		captureFlow() {
			var Flow = require("../test/SDKTasks/Flow.js");
			this.flow = new Flow({});
			this.flow.capture(this.backend);
			this.flow.capture(this.connector.BL);
		}
		
		async _destroy() {
			this._saveFlow();
			await this.connector.destroy();
			this.logger.destroy();
		}
		
		async _updateTask(data) {
			try {
				await this.backend.updateTask(this.id, data);
			} catch(ex) {
				this.logger.info(`updateTask failed: ${ex}`);
			}
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
			return new Promise(resolve => {
				this.logger.debug(`Starting task timeout: ${config.taskTimeout} ms`);
				setTimeout(() => {
					resolve(new Result.Timeout({ "entity": "task" }));
				}, config.taskTimeout);
			});
		}
		
		_saveFlow() {
			if (!this.flow) return;
			var flowData = {
				title	: "Recorded flow",
				task	: this.data.type,
				taskData: this.data,
				steps	: this.flow.steps
			};
			
			var fs = require("fs");
			var flowFile = process.env.logStream == "file" ?
				path.join(path.dirname(this.logger._fileName), "flow.json") :
				path.join("log", `${this.data.type}-${this.id}-flow.json`);
				
			fs.writeFile(flowFile, JSON.stringify(flowData), err => {});
		}
		
		_archiveLogs() {
			var fs = require('fs'), path = require("path"), archiver = require('archiver');
			return new Promise(resolve => {
				var zipPath = path.join("log", `feedback-${this.id}.zip`);
				var output = fs.createWriteStream(zipPath);
				output.on("close", function() {	resolve(zipPath); });
				var archive = archiver("zip", { zlib : { level: 9 } });
				archive.pipe(output);
				archive.directory(path.dirname(this.logPath), false);
				archive.finalize();
			});
		}
	};

	class InternalTask extends Task {
		_updateTaskInProgress() {}
        _updateTask() {}
	};
	
	return { Task, InternalTask };
};
