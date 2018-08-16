const Result = require('./Result');
var Duplex = require('stream').Duplex;
const utils = require("./utils.js");
const {promisify} = require('util');
const fs = require("fs");
const path = require("path");
const readDir = promisify(fs.readdir);
const existDir = promisify(fs.exists);
const removeFile = promisify(fs.unlink);

module.exports = Object.assign(Object.create(null), {
    async sync(){
		var sendPromise = Promise.resolve();
		this.connector.setSignatureList(await this.backend.getBackendApprovals({ logger : this.logger }));
		var taskResult = await this.connector.sync({
			logger		: this.logger,
			syncType	: this.data.syncType,
			send		: (approvalsRes) => {
			    return sendPromise = sendPromise.then(() => this.backend.sendApprovals(approvalsRes, { logger : this.logger }))
                    .catch((ex) => { this.logger.error(`Failed to send approvals to the backend ${ex.message}`) });
			}
		});

        try {
            await sendPromise;
        } catch (ex) {
            this.logger.error(`Sync task was failed ${ex.message}`);
            return new Result.InternalError({}, { entity: "task", taskType: "sync", message: ex.message });
        }

        return taskResult;
	},

    async authenticate() {
        if (!this.data.volatile || !this.data.volatile.system) {
            this.logger.error(`Failed to perform authenticate task - data.volatile doesn't exist!`);
            return new Result.InternalError({}, { entity: "task", taskType: "authenticate", message: `Failed to perform authenticate task - data.volatile doesn't exist!` });
        }
        return await this.connector.authenticate({ credentials: this.data.volatile.system });
    },

    async approve() {
        return performAction.call(this, "approve");
	},
	
    async reject() {
        return performAction.call(this, "reject");
	},

	async additionalActions() {
        return performAction.call(this, "additionalActions");
	},
    
    async getAttachment() {
		var options = { logger : this.logger }, data = this.data;
        let res = await this.connector.downloadAttachment({ attachmentId: data.volatile.attachmentId, approval: data.approval }, options);

        if(!(res instanceof Result.Success)) {
            res.addMeta("entity", "attachment");
            return res;
        }

        this.logger.log(`received attachment data from connector ${res.data.mediaType ? "with" : "without"} content-type${res.data.mediaType ? ": " + res.data.mediaType : ""}`);

        let stream = new Duplex();
        stream.push(res.data.data);
        stream.push(null);
		await this.backend.sendAttachment(this.id, res.data.mediaType, stream);
		return res;
	},
	
	async mapUserIds() {
		var res = await this.connector.mapUserIds({ ids : this.data.payload.ids }, { logger : this.logger });
		if (!(res.data.users instanceof Array))
			return this.logger.error(`mapUserIds: Invalid response from connector: ${JSON.stringify(res)}`);
		
		return this.backend.sendUserIds(res.data.users);
	},

    async getApproval() {
        var data = this.data;
        var options = { logger : this.logger };

        var res = await this.connector.getApproval(data, options);
        this.backend.updateTask(this.id, res);
    },

    async transformApprovals() {
        var data = this.data;
        var rawApprovals = data.rawApprovals || [];
        var approvals = [];

        var transformedApprovals = data.transformedApprovals || rawApprovals.map(approval => this.connector.addApprovalData(approval));
        this.backend.sendApprovals({approvals, rawApprovals, transformedApprovals});
    },

    /**
     * @param data (array of taskIds)
     * Search task id's at log & log_archive folders.
     * Compress all the folders to zip file.
     * Send the zip as feedback to back end.
     * @returns {Promise<Boolean> [indicator if success sending]}
     */
    async sendFeedback() {
        var data = this.data;
        var taskIds = data.taskIds;
        var feedbackName = data.feedbackName || `feedback-${Date.now()}`;
        this.logger.log(`start sendFeedback for ${taskIds}`);
        if (await existDir("log")) {
            var logFiles = [];
            for(var i=0; i<taskIds.length; i++){
                var logFile = await searchLog(taskIds[i], "log") || await searchLog(taskIds[i], "log_archive");
                if (logFile){
                    logFiles.push(logFile);
                } else {
                    this.logger.error(`Can't find log file at: ${taskIds[i]}`);
                }
            }
            if (logFiles.length > 0) {
                var zipPath = await utils.archiveLogs(logFiles, feedbackName);
                this.logger.log(`Sending feedback: ${feedbackName} to back end...`);
                await this.backend.sendFeedback(feedbackName, zipPath);
                await removeFile(zipPath);
                this.logger.log(`successfully sent feedback: ${feedbackName} to back end.`);
            }else{
                var msg = `Logs doesn't exist at log & log_archive dirs`
                this.logger.error(msg);
                throw new Error(msg);
            }
        } else {
            var msg = `log dir doesn't exist.`;
            this.logger.error(msg);
            throw new Error(msg);
        }

        async function searchLog(taskId, dirName){
            var logFiles = await readDir(dirName);
            var logFile = logFiles.find((file) => file.includes(taskId) && !file.includes("feedback"));
            if(logFile){
                return {name:logFile , path: path.join(process.cwd(),dirName,logFile)};
            }
            return false;
        }
    }
});

async function performAction(action) {
    var data = this.data;
    var volatile = data.volatile || {};

    this.connector.setSignatureList(await this.backend.getBackendApproval({ logger: this.logger, id: data.approval.id }));

    var taskResult;
    switch (action) {
        case "approve":
            taskResult = Result(await this.connector.approve({approval: data.approval, credentials: volatile.system, approveComment: volatile.approveComment}));
            break;
        case "reject":
            taskResult = Result(await this.connector.reject({approval: data.approval, credentials: volatile.system, rejectionReason: volatile.rejectionReason}));
            break;
        case "additionalActions":
            if (data.volatile){
                taskResult = Result(await this.connector.additionalActions({action: data.type, approval: data.approval, data: data.volatile}));
            } else {
                this.logger.error(`Trying to perform additionalActions but data.volatile was not provided`);
                return new Result.InternalError({}, { entity: "task", taskType: this.taskType, message: "Trying to perform additionalActions but data.volatile was not provided" });
            }
            break;
        default:
            this.logger.error(`Trying to perform unknown action: ${action}`);
            return new Result.InternalError({}, {entity: "task", taskType: action, message: "Trying to perform unknown action" });
    }

    if(taskResult instanceof Result.Success || taskResult instanceof Result.DataMismatch || taskResult instanceof Result.NotFound) {
        if(taskResult.data.approvalsData.approvals.length > 0) {
            this.logger.info(`Sending ${taskResult.data.approvalsData.approvals.length} approvals to backend`);
            await this.backend.sendApprovals(taskResult.data.approvalsData, { logger: this.logger });
        }
    }

    return taskResult;
}