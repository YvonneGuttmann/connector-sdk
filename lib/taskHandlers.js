
var Duplex = require('stream').Duplex;

module.exports = Object.assign(Object.create(null), {
    async sync(){
		var sendPromise = Promise.resolve();
		this.connector.signatureList = await this.backend.getBackendApprovals({ logger : this.logger });
		await this.connector.sync({
			logger		: this.logger,
			syncType	: this.data.syncType,
            getUITemplate: this.api.getUITemplate.bind(this.api),
			send		: (approvals, rawApprovals) => { return sendPromise = sendPromise.then(() => this.backend.sendApprovals(approvals, rawApprovals, { logger : this.logger })); }
		});
		return sendPromise;
	},

    async authenticate() {
        if (this.data.volatile) return await this.connector.authenticate({ credentials: this.data.volatile.system }, opt);
		
        this.logger.log(`data.volatile doesn't exist!`);
        return await this.connector.authenticate({credentials: this.data.volatile}, { logger : this.logger });
    },
	
    async approve() {
        var data = this.data;
		var options = {
			logger : this.logger,
			getUITemplate: this.api.getUITemplate.bind(this.api)
		};

		this.connector.signatureList = await this.backend.getBackendApproval({ logger: this.logger, id: data.approval.id });
		
		if (data.volatile){
            var approvalSyncResult = await this.connector.approve({approval: data.approval, credentials: data.volatile.system}, options);
        } else {
			this.logger.log(`data.volatile doesn't exist!`);
			var approvalSyncResult = await this.connector.approve({approval: data.approval, credentials: data.volatile}, options);
		}

		await this.backend.sendApprovals(approvalSyncResult, options);
	},
	
    async reject() {
        var data = this.data;
		var options = {
			logger : this.logger,
			getUITemplate: this.api.getUITemplate.bind(this.api)
		};

		this.connector.signatureList = await this.backend.getBackendApproval({ logger: this.logger, id: data.approval.id });
		
		if (data.volatile){
			var approvalSyncResult = await this.connector.reject({approval: data.approval, credentials: data.volatile.system, rejectionReason: data.volatile.rejectionReason}, options);
		} else {
			this.logger.log(`data.volatile doesn't exist!`);
			var approvalSyncResult = await this.connector.reject({approval: data.approval, credentials: data.volatile, rejectionReason: data.volatile.rejectionReason}, options);
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
	}
});
