const Result = require('./Result');
var Duplex = require('stream').Duplex;

module.exports = Object.assign(Object.create(null), {
    async sync(){
		// var sendPromise = Promise.resolve();
		this.connector.setSignatureList(await this.backend.getBackendApprovals({ logger : this.logger }));
		var taskResult = await this.connector.sync({
			logger		: this.logger,
			syncType	: this.data.syncType,
			// send		: (approvalsRes) => { return sendPromise = sendPromise.then(() => this.backend.sendApprovals(approvalsRes, { logger : this.logger })); }
		});

		if(taskResult.data.approvalsData) {
		    this.logger.info(`Sending ${taskResult.data.approvalsData.approvals.length} approvals to backend`);
            await this.backend.sendApprovals(taskResult.data.approvalsData, {logger: this.logger});
        }

		return taskResult;
		// return sendPromise;
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