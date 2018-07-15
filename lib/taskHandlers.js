
var Duplex = require('stream').Duplex;

module.exports = Object.assign(Object.create(null), {
    async sync(){
		var sendPromise = Promise.resolve();
		this.connector.setSignatureList(await this.backend.getBackendApprovals({ logger : this.logger }));
		await this.connector.sync({
			logger		: this.logger,
			syncType	: this.data.syncType,
            getUITemplate: this.backend.getUITemplate.bind(this.backend),
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
});
