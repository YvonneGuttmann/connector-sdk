
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
		await this.connector.sync({
			logger		: this.logger,
			syncType	: this.data.syncType,
            getUITemplate: this.backend.getUITemplate.bind(this.backend),
            mappedUsers : this.data.mappedUsers,
			send		: (approvalsRes) => { return sendPromise = sendPromise.then(() => this.backend.sendApprovals(approvalsRes, { logger : this.logger })); }
		});
		return sendPromise;
	},

    async authenticate() {
        if (!this.data.volatile || !this.data.volatile.system) {
            this.logger.error(`data.volatile doesn't exist!`);
            throw "AUTHENTICATION";
        }
        return await this.connector.authenticate({ credentials: this.data.volatile.system });
    },
	
    async approve() {
        var data = this.data;
        var volatile = data.volatile || {};
		var options = {
			logger : this.logger,
			getUITemplate: this.backend.getUITemplate.bind(this.backend)
		};

		this.connector.setSignatureList(await this.backend.getBackendApproval({ logger: this.logger, id: data.approval.id }));

        var approvalSyncResult = await this.connector.approve({approval: data.approval, credentials: volatile.system, approveComment: volatile.approveComment}, options);

		await this.backend.sendApprovals(approvalSyncResult, options);
	},
	
    async reject() {
        var data = this.data;
        var volatile = data.volatile || {};
		var options = {
			logger : this.logger,
			getUITemplate: this.backend.getUITemplate.bind(this.backend)
		};

		this.connector.setSignatureList(await this.backend.getBackendApproval({ logger: this.logger, id: data.approval.id }));

        var approvalSyncResult = await this.connector.reject({approval: data.approval, credentials: volatile.system, rejectionReason: volatile.rejectionReason}, options);

        await this.backend.sendApprovals(approvalSyncResult, options);
	},

	async additionalActions() {
        var data = this.data;
        var options = {
            logger : this.logger,
            getUITemplate: this.backend.getUITemplate.bind(this.backend)
        };

        this.connector.setSignatureList(await this.backend.getBackendApproval({ logger: this.logger, id: data.approval.id }));
        if (data.volatile){
            var approvalSyncResult = await this.connector.additionalActions({action: data.type, approval: data.approval, data: data.volatile}, options);
        } else {
            this.logger.log(`data.volatile doesn't exist!`);
            throw `data.volatile doesn't exist!`
        }

        await this.backend.sendApprovals(approvalSyncResult, options);
	},
    
    async getAttachment() {
		var options = { logger : this.logger }, data = this.data;
		let {data:downloadData, contentType} = await this.connector.downloadAttachment({ attachmentId: data.volatile.attachmentId, approval: data.approval }, options);
        this.logger.log(`received attachment data from connector with content-type: ${contentType}`);
        let stream = new Duplex();
        stream.push(downloadData);
        stream.push(null);
		return this.backend.sendAttachment(this.id, contentType, stream);
	},
	
	async mapUserIds() {
		var res = await this.connector.mapUserIds({ ids : this.data.payload.ids }, { logger : this.logger });
		if (!(res instanceof Array))
			return this.logger.error(`mapUserIds: Invalid response from connector: ${res}`);
		
		return this.backend.sendUserIds(res);
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
