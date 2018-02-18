/**
 * Manages the communication with the backend server:
 * 1. Registers to the backend.
 * 2. Start connection polling
 * 3. fetch tasks
 */
var axios = require('axios');
var Duplex = require('stream').Duplex;
var toMB = bytes => Math.round(bytes / 1024 / 1024 * 100) / 100;

const BULK_SIZE = 100000;
const TASK_PROGRESS_INTERVAL = 30 * 1000;
const MONITOR_MEMORY_INTERVAL = 5 * 60 * 1000;
const MEMORY_MAX_LOWER_LIMIT = 1000; //in MB
const MEMORY_MAX_UPPER_LIMIT = 1500; //in MB

exports.ComManager = class ComManager{
    constructor(connector, props){

        this.config = props.config;

        if (!this.config || !this.config.controllerConfig || !this.config.controllerConfig.apiUrl) throw `Controller config was not found`;

        this.connector = connector;
        this.syncver = 0;
        this.apiUrl = this.config.controllerConfig.apiUrl;
        this.data = [];
        this.dataCache = {};
        this.workInProgressTasks = {};
        this.logger = props.logger.child({component: "com"});
		this.maxConcurrentTasks = this.config.controllerConfig.maxConcurrentTasks || 10;
    }

    async start(){
        await this.register();

        await this.getConfiguration();
        await this._syncData({logger: this.logger});
        await this.connector.init({ config: this.config, logger: this.logger });
        await this.pollForTask()

        this.memoryUsageInterval = setInterval (this.monitorMemoryUsage.bind(this), this.config.controllerConfig.memoryMonitoringInterval || MONITOR_MEMORY_INTERVAL);
    }

    async stop(){
        var workInProgressTasks = Object.keys(this.workInProgressTasks);
        for (var i = 0; i < workInProgressTasks.length; i++){
            var taskId = workInProgressTasks[i];
            try{
                this.logger.log(`Terminating task ${taskId} of type ${this.workInProgressTasks[taskId] && this.workInProgressTasks[taskId].type}`);

                delete this.workInProgressTasks[taskId];
                await this._updateTask(taskId, { succeeded : false });
            }
            catch (err){
                this.logger.error(`Could not update task ${taskId}, stack: ${err.stack}`);
            }
        }
    }

    async register(){
        //Anything we want to tell the world when connector starts would be coded here
    }

    async monitorMemoryUsage() {
        this.memoryUsage = process.memoryUsage();
        this.logger.info ({
            rss: toMB(this.memoryUsage.rss),
            heapTotal: toMB(this.memoryUsage.heapTotal),
            heapUsed: toMB(this.memoryUsage.heapUsed),
            external: toMB(this.memoryUsage.external),
        }, `Process memory usage`);

        var memoryUsageLowerLimit = (this.config.controllerConfig.maxMemoryUsage && this.config.controllerConfig.maxMemoryUsage.lowerLimit) || MEMORY_MAX_LOWER_LIMIT;
        var memoryUsageUpperLimit = (this.config.controllerConfig.maxMemoryUsage && this.config.controllerConfig.maxMemoryUsage.memoryUsageUpperLimit) || MEMORY_MAX_UPPER_LIMIT;


        if (toMB(this.memoryUsage.rss) > memoryUsageLowerLimit) {
            this.logger.info (`Memory usage (${toMB(this.memoryUsage.rss)}) has reached max lower limit (${memoryUsageLowerLimit}). shutting down process (start task draining).`);
            var activeTasksCount = Object.keys(this.workInProgressTasks).length;

            if (!activeTasksCount) {
                this.logger.info (`No tasks are running. exiting...`);
                process.exit(3);
            }

            this.shuttingDown = true;
            clearInterval (this.memoryUsageInterval);
        }
        else if (toMB(this.memoryUsage.rss) > memoryUsageUpperLimit) {
            logger.error (`Memory usage reached upper limit: ${toMB(this.memoryUsage.rss)} (Upper limit: ${memoryUsageUpperLimit})`);
            process.exit(4);
        }
    }

    async pollForTask(){
		if (this._polling) return;
		var activeTasksCount = Object.keys(this.workInProgressTasks).length;
		if (activeTasksCount >= this.maxConcurrentTasks) {
			this.logger.log(`Max concurrent tasks reached (${this.maxConcurrentTasks}). Not polling`);
			return;
		}
		if (this.shuttingDown) {
		    this.logger.info (`Shutting down processs.. Current task count: ${activeTasksCount}. Not polling.`);
		    if (activeTasksCount == 0) {
                this.logger.info (`Finished draining tasks, closing process.`);
                process.exit(3);
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

    async getConfiguration(props = {}){
        //This is where we'll fetch configuration from a shared DB or API

        if (!this.config.controllerConfig.creds || !this.config.controllerConfig.creds.apiKey || !this.config.controllerConfig.creds.apiSecret)
            throw `API credentials was not found in configuration`;

        this.requestHeaders = {
            "x-capriza-api-key" : this.config.controllerConfig.creds.apiKey,
            "x-capriza-secret" : this.config.controllerConfig.creds.apiSecret,
            "x-capriza-connector-id" : this.config.controllerConfig.connectorId
        };
    }

    async _doSync(options){
        return await this.connector.sync(options);
    }

    async _doApprove(data, options){
        if(data.volatile){
            return await this.connector.approve({approval: data.approval, credentials: data.volatile.system}, options);
        }
        options.logger.log(`data.volatile doesn't exist!`);
        return await this.connector.approve({approval: data.approval, credentials: data.volatile}, options);
    }

    async _doReject(data, options){
        if(data.volatile){
            return await this.connector.reject({approval: data.approval, credentials: data.volatile.system, rejectionReason: data.volatile.rejectionReason}, options);
        }
        options.logger.log(`data.volatile doesn't exist!`);
        return await this.connector.reject({approval: data.approval, credentials: data.volatile, rejectionReason: data.volatile.rejectionReason}, options);
    }

    async _doAuthenticate(data, options){
        if(data.volatile){
            return await this.connector.authenticate({credentials: data.volatile.system}, options);
        }
        options.logger.log(`data.volatile doesn't exist!`);
        return await this.connector.authenticate({credentials: data.volatile}, options);
    }

    async _doDownloadAttachment(data, options){
        let {data:downloadData, contentType} = await this.connector.downloadAttachment({ attachmentId: data.volatile.attachmentId, approval: data.approval }, options);
        options.logger.log (`received attachment data from connector with content-type: ${contentType}`);
        let stream = new Duplex();
        stream.push(downloadData);
        stream.push(null);

        return await axios(
            {
                method: "POST",
                url: `${this.apiUrl}/resources/${data.id}`,
                headers: Object.assign({"Content-Type" : contentType || "application/octet-stream"}, this.requestHeaders),
                data: stream
            });
    }

    async _syncData(options){
        try{
            options.logger.info("Fetching approvals for sync from backend. syncver:" + this.syncver);
            var response = await axios.get(`${this.apiUrl}/rawapprovals?syncver=${this.syncver}`, { headers : this.requestHeaders }),
                currentData = response.data;

            options.logger.info(`Fetched ${currentData.length} approvals from backend`);

            if (currentData && currentData.length){
                currentData.forEach(serverApproval=>{
                    if (serverApproval.syncver > (this.syncver || -1)) {
                        this.syncver = serverApproval.syncver;
                    }

                    if (!serverApproval.deleted){
                        this.dataCache[serverApproval.id] = serverApproval;
                    } else {
                        delete this.dataCache[serverApproval.id]
                    }
                });

                this.connector.signatureList = this.data = Object.values(this.dataCache);
            }


            this.currSyncData = response.data;
            return this.currSyncData;
        } catch (error){
            options.logger.error("syncdata failed");

            throw error;
        }
    }

    async _sendApprovals(approvals, options) {
        var bulk = [], promises = [], bulkSize = 0;
        for (var i = 0; i < approvals.length; i++){
            var approval = approvals[i],
                approvalSize = JSON.stringify(approval).length;

            if (approvalSize > BULK_SIZE){
                options.logger.error(`Approval is to large and cannot be sent to server: ${approval.private.id} , size: ${approvalSize}`);
                continue;
            }

            if (bulkSize + approvalSize > BULK_SIZE){
                options.logger.log(`Sending bulk update length: ${bulk.length}, size: ${bulkSize}`);
                promises.push(axios.post(`${this.apiUrl}/rawapprovals`, bulk, { headers : this.requestHeaders }));
                bulk = [];
                bulkSize = 0;
            }

            bulk.push(approval);
            bulkSize += approvalSize;
        }

        if (bulk.length){
            options.logger.log(`Sending bulk update length: ${bulk.length}, size: ${bulkSize}`);
            promises.push(axios.post(`${this.apiUrl}/rawapprovals`, bulk, { headers : this.requestHeaders }));
        }

        return Promise.all(promises);
    }

    updateTaskInProgress(taskId, logger){
        var attempts = 1;
        var updatingProgress = setInterval ( async () => {
            logger.info (`Updating progress of task '${taskId}', attempt: ${attempts}`);
            try {
                return await axios.patch(`${this.apiUrl}/connectors/tasks/${taskId}`, {
                    progress: 50,
                }, {headers: this.requestHeaders});
            }
            catch (ex) {
                logger.error (`Failed to update progress on task '${taskId}': ${ex.message}, attempt: ${attempts++}`);
                if (attempts >= 3) {
                    logger.info (`Stopping to update progress on task '${taskId}' after ${attempts} attempts`);
                    clearInterval ( updatingProgress );
                }
            }
        }, TASK_PROGRESS_INTERVAL);

        return {
            stop () {
                logger.info (`Stopping to update progress on task '${taskId}'`);
                clearInterval ( updatingProgress );
            }
        }
    }

    async _performTask(task){
        var taskId = task.data.id, taskType = task.data.type, taskError;
        var taskLogger = this.logger.child ({taskType, taskId});
        var progressUpdater;
        taskLogger.log (`Performing task '${taskId}' of type '${taskType}'`);
        try{
            this.workInProgressTasks[taskId] = { type : taskType };

            progressUpdater = this.updateTaskInProgress(taskId, taskLogger);
            await this._syncData({logger: taskLogger});
            switch(taskType) {
                case "sync":
                    var approvalSyncResult = await this._doSync({logger: taskLogger});
                    taskLogger.log(`Got ${approvalSyncResult.length} approvals to send...`);
                    await this._sendApprovals(approvalSyncResult, {logger: taskLogger});
                    break;
                case "approve":
                    var approvalSyncResult = await this._doApprove(task.data, {logger: taskLogger});
                    await this._sendApprovals(approvalSyncResult, {logger: taskLogger});
                    break;
                case "reject":
                    var approvalSyncResult = await this._doReject(task.data, {logger: taskLogger});
                    await this._sendApprovals(approvalSyncResult, {logger: taskLogger});
                    break;
                case "getAttachment":
                    await this._doDownloadAttachment(task.data, {logger: taskLogger});
                    break;
                case "authenticate":
                    await this._doAuthenticate(task.data, {logger: taskLogger});
                    break;
                default:
                    throw new Error(`Unknown task type ${taskType}`);
            }
        }
        catch (err){
            taskLogger.error(`performTask failed. taskId ${taskId}. Error: ${err.stack || err}`);
            taskError = err;

            progressUpdater && progressUpdater.stop();

            if (err.approvalSyncResult) {
                taskLogger.debug ("Sending updated approval after failed action");
                try { await this._sendApprovals(err.approvalSyncResult, {logger: taskLogger}); }
                catch (ex) { taskLogger.error ("failed to send updated approval after failed action"); }
            }
        }

        taskLogger.info(`Task ${taskId} of type ${taskType} ended ${(!taskError ? "successfully" : `with error ${taskError.message}`)}  `);
        progressUpdater && progressUpdater.stop();
        delete this.workInProgressTasks[taskId];
        return await this._updateTask(taskId, {succeeded: !taskError, payload: taskError});
    }

    async _updateTask(taskId, params = {}){
        return axios.patch(`${this.apiUrl}/connectors/tasks/${taskId}`, params, { headers : this.requestHeaders });
    }
}