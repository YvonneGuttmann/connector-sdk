/**
 * Manages the communication with the backend server:
 * 1. Registers to the backend.
 * 2. Start connection polling
 * 3. fetch tasks
 */
var axios = require('axios');
var toMB = bytes => Math.round(bytes / 1024 / 1024 * 100) / 100;

var defaultControllerConfig = {
    monitorMemoryInterval: 5 * 60 * 1000,   //5 min
    memoryMaxLowerLimit: 1000,              //in MB
    memoryMaxUpperLimit: 1500,              //in MB
    maxConcurrentTasks: 10,
}

exports.ComManager = class ComManager{
    constructor({ apiUrl, requestHeaders, TaskClasses, logger, config }) {
        this.config = Object.assign({}, defaultControllerConfig, config);
        this.apiUrl = apiUrl;
		this.requestHeaders = requestHeaders;
		this.TaskClasses = TaskClasses;
        this.workInProgressTasks = {};
        this.logger = logger.child({component: "com"});
        this.configureProxy();
    }

    configureProxy() {
        if(this.config.proxy) {
            require('proxying-agent').globalize(this.config.proxy);
            this.logger.log(`Proxy enable`);
        } else {
            this.logger.log(`Proxy disable`);
        }
    }

    async start(){
		this.memoryUsageInterval = setInterval(this.monitorMemoryUsage.bind(this), this.config.monitorMemoryInterval);
		
		var runPartialSync = async () => {
			try {
				var task = new this.TaskClasses.InternalTask({ id : "partialSync-" + Date.now(), type : "sync", syncType : "partial" }, this);
				await task.execute();
			} catch(ex) {
				this.logger.error(`Error running partialSync ${task && task.id}, ex: ${ex}`);
			} finally {
				setTimeout(runPartialSync, this.config.partialSyncInterval);
			}
		};
		
		if (this.config.partialSyncInterval)
			setTimeout(runPartialSync, this.config.partialSyncInterval);
		
        await this.pollForTask();
    }

    async stop(){
        var workInProgressTasks = Object.values(this.workInProgressTasks);
        for (var i = 0; i < workInProgressTasks.length; i++){
            try {
				await workInProgressTasks[i].abort();
            } catch (err){
                this.logger.error(`Could not abort task ${workInProgressTasks[i].id}, stack: ${err.stack}`);
            }
        }
    }

    async monitorMemoryUsage() {
        this.memoryUsage = process.memoryUsage();
        this.logger.info ({
            rss: toMB(this.memoryUsage.rss),
            heapTotal: toMB(this.memoryUsage.heapTotal),
            heapUsed: toMB(this.memoryUsage.heapUsed),
            external: toMB(this.memoryUsage.external),
        }, `Process memory usage`);


        if (toMB(this.memoryUsage.rss) > this.config.memoryMaxLowerLimit) {
            this.logger.info (`Memory usage (${toMB(this.memoryUsage.rss)}) has reached max lower limit (${this.config.memoryMaxLowerLimit}). shutting down process (start task draining).`);
            var activeTasksCount = Object.keys(this.workInProgressTasks).length;

            if (!activeTasksCount) {
                this.logger.info (`No tasks are running. exiting...`);
                setTimeout(() => process.exit(3), 2000);
            }

            this.shuttingDown = true;
            clearInterval (this.memoryUsageInterval);
        }
        else if (toMB(this.memoryUsage.rss) > this.config.memoryMaxUpperLimit) {
            logger.error (`Memory usage reached upper limit: ${toMB(this.memoryUsage.rss)} (Upper limit: ${this.config.memoryMaxUpperLimit})`);
            setTimeout(() => process.exit(4), 2000);
        }
    }

    async pollForTask(){
		if (this._polling) return;
		var activeTasksCount = Object.keys(this.workInProgressTasks).length;
		if (activeTasksCount >= this.config.maxConcurrentTasks) {
			this.logger.log(`Max concurrent tasks reached (${this.config.maxConcurrentTasks}). Not polling`);
			return;
		}
		if (this.shuttingDown) {
		    this.logger.info (`Shutting down processs.. Current task count: ${activeTasksCount}. Not polling.`);
		    if (activeTasksCount == 0) {
                this.logger.info (`Finished draining tasks, closing process.`);
                setTimeout(() => process.exit(3), 2000);
            }
		    return;
        }
        this.logger.log(`Polling for task. activeTasksCount=${activeTasksCount}`);
		this._polling = true;

        try {
			var task = await axios.get(`${this.apiUrl}/connectors/tasks`, { headers : this.requestHeaders });
        } catch (err) {
			this._polling = false;
            this.logger.error(`Failed to fetch task. error: ${err}`);
			return setTimeout(() => this.pollForTask(), 5000);
        }

		this._polling = false;
        if (task && task.data && task.data.id) {
            this._performTask(task)
				.catch(ex => this.logger.error(`Could not update task ${task.data.id} of type ${task.data.type}. error: ${ex}`))
				.then(() => { this.pollForTask(); })
        } else {
			this.logger.log(`Task data from server ${task && task.data && JSON.stringify(task.data)}`);
        }
		this.pollForTask();
    }

    async _performTask(taskObj){
        try {
			var task = new this.TaskClasses.Task(taskObj.data);
            this.workInProgressTasks[task.id] = task;
			await task.execute();
        } catch (ex){
			this.logger.error(`Could not perform task ${task && task.id}, stack: ${ex.stack}`);
		}
		if (task) delete this.workInProgressTasks[task.id];
    }	
};
