/**
 * Manages the communication with the backend server:
 * 1. Registers to the backend.
 * 2. Start connection polling
 * 3. fetch tasks
 */
var axios = require('axios');
var Duplex = require('stream').Duplex;
var Configuration = require('./config');
const BULK_SIZE = 100000;

async function updateInProgress(taskId){
    //TODO: decide on protocol
    /*return axios.patch(`${apiUrl}/connectors/tasks/${taskId}`, {
        status: "in-progress",
    });*/
}

exports.ComManager = class ComManager{
    constructor(connector, props){
        this.connector = connector;
        this.syncver = 0;
        this.apiUrl = Configuration.getConfig().apiUrl;
        this.data = [];
        this.dataCache = {};
        this.workInProgressTasks = {};
        this.requestHeaders = {};
        this.logger = props.logger.child({component: "com"});
    }

    async start(){
        await this.register();
        return await this._syncData({logger: this.logger});
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
        try{
            this.requestHeaders = Configuration.getConfig()["capriza-api"]["header"];
        }
        catch (e){
            throw new Error("Could not resolve 'x-capriza-api-key'");
        }
    }

    async pollForTask(){
        this.logger.log("Polling for task");
        var task = await this._fetchTask();
        if (task && task.data && task.data.id) {
            this._performTask(task).catch(()=>this.logger.error(`Could not update task ${task.data.id} of type ${task.data.type}`));
            return true;
        } else {
            this.logger.log(`Task data from server ${task && task.data && JSON.stringify(task.data)}`);
        }
    }

    async _doSync(options){
        return await this.connector.sync(options);
    }

    async _doApprove(data, options){
        return await this.connector.approve({approval: data.approval, credentials: data.volatile}, options);
    }

    async _doReject(data, options){
        return await this.connector.reject({approval: data.approval, credentials: data.volatile, rejectionReason: data.volatile.rejectionReason}, options);
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

    async _fetchTask(){
        try{
            return await axios.get(`${this.apiUrl}/connectors/tasks`, { headers : this.requestHeaders });
        }
        catch (err){
            this.logger.error(`fetchTask failed ${err}`);
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

    async _performTask(task){
        var taskId = task.data.id, taskType = task.data.type, taskError;
        var taskLogger = this.logger.child ({taskType, taskId});
        taskLogger.log (`Performing task '${taskId}' of type '${taskType}'`);
        try{
            this.workInProgressTasks[taskId] = { type : taskType };

            await updateInProgress(taskId);
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
                    taskLogger.log (`**** TASK: ${JSON.stringify(task.data)}`);
                    var approvalSyncResult = await this._doReject(task.data, {logger: taskLogger});
                    await this._sendApprovals(approvalSyncResult, {logger: taskLogger});
                    break;
                case "getAttachment":
                    await this._doDownloadAttachment(task.data, {logger: taskLogger});
                    break;
                default:
                    throw new Error(`Unknown task type ${taskType}`);
            }
        }
        catch (err){
            taskLogger.error(`performTask failed. taskId ${taskId}. Error: ${err.stack}`);
            taskError = err;

            if (err.approvalSyncResult) {
                taskLogger.debug ("Sending updated approval after failed action");
                try { await this._sendApprovals(err.approvalSyncResult, {logger: taskLogger}); }
                catch (ex) { taskLogger.error ("failed to send updated approval after failed action"); }
            }
        }

        taskLogger.info(`Task ${taskId} of type ${taskType} ended ${(!taskError ? "successfully" : `with error ${taskError.message}`)}  `);
        delete this.workInProgressTasks[taskId];
        return await this._updateTask(taskId, {succeeded: !taskError, payload: taskError});
    }

    async _updateTask(taskId, params = {}){
        return axios.patch(`${this.apiUrl}/connectors/tasks/${taskId}`, params, { headers : this.requestHeaders });
    }
}