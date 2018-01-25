var syncher = require ("./syncher.js");
var hashFunction = require('object-hash');
var jslt = require('jslt');

exports.Connector = class Connector {
    constructor () {
        this.BL = require(process.cwd());
        this.signatureList = [];
    }

    _addApprovalData (approval) {
        if (this.config.schemaTransformer) approval = jslt.transform(approval, this.config.schemaTransformer);

        if ("attachmentIds" in approval.private)
            approval.attachmentIds = approval.private.attachments;

        approval.signature = this._createApprovalSignature(approval);
        approval.systemUserId = approval.private.approver; //(todo) should be: hashFunction(approval.private.approver)
        return approval;
    }

    _createApprovalSignature(approval){
        var signatureTemplate = this.config.signatureTransformer;
        var signatureObj = signatureTemplate ? jslt.transform(approval, signatureTemplate) : approval;

        return hashFunction(signatureObj);
    }

    async init(context){
        this.config = context.config.controllerConfig;
        return this.BL.init({config: context.config.blConfig, logger: context.logger});
    }

    async stop(){
        return this.BL.stop();
    }

    async sync (options){
        var logger = options.logger.child({component: "connector-controller"});
        logger.info (`syncing hash list (length = ${this.signatureList.length})`);
        var approvals;
        approvals = await this.BL.fetch({logger});
        approvals = approvals.map (this._addApprovalData.bind(this));
        return syncher.sync (this.signatureList, approvals, {logger});
    }
    async approve (data, options){
        var logger = options.logger.child({component: "base-connector"});
        logger.info (`approving approval: ${data.approval.private.id}`);
        var fetchedApproval, updatedApproval;
        var currentApproval = this.signatureList.find (approval => approval.id == data.approval.id);
        try {
            if (currentApproval.signature !== data.approval.signature){
                throw `Approve failed for approval '${data.approval.private.id}'. approval doesn't match latest backend approval`;
            }

            fetchedApproval = await this.BL.getApproval(data.approval, {logger});
            if (!fetchedApproval) throw `Approval '${data.approval.private.id}' was not returned from the connector`;
            fetchedApproval = this._addApprovalData(fetchedApproval);
            if (fetchedApproval.signature == data.approval.signature) {
                logger.info (`Signatures match, passing approval to connector.`);
                await this.BL.approve(data, {logger});
                logger.info (`Connector approved, fetching the updated approval`);
                updatedApproval = await this.BL.getApproval(data.approval, {logger});
                if (updatedApproval) updatedApproval = this._addApprovalData(updatedApproval);
                return syncher.sync ([currentApproval], updatedApproval ? [updatedApproval] : [], {logger});
            }
            else
                throw `Approve failed for approval '${data.approval.private.id}'. data doesn't match in the source system`;
        }
        catch (ex) {
            var error = new Error ("Error approving approval");
            error.details = ex.message || ex;
            logger.error (`Error approving approval: ${error.details} \n ${ex.stack}`);
            var approvalList = [];
            if (updatedApproval) approvalList = [approvalList];
            else if (fetchedApproval) approvalList = [fetchedApproval];
            error.approvalSyncResult = syncher.sync ([currentApproval], approvalList, {logger});
            throw error;
        }
    }
    async reject (data, options){
        var logger = options.logger.child({component: "base-connector"});
        logger.info (`rejecting approval: ${data.approval.private.id}`);
        var fetchedApproval, updatedApproval;
        var currentApproval = this.signatureList.find (approval => approval.id == data.approval.id);
        try {

            if (currentApproval.signature !== data.approval.signature){
                throw `Reject failed for approval '${data.approval.private.id}'. approval doesn't match latest backend approval`;
            }

            fetchedApproval = await this.BL.getApproval(data.approval, {logger});
            if (!fetchedApproval) throw `Approval '${data.approval.private.id}' was not returned from the connector`;
            fetchedApproval = this._addApprovalData(fetchedApproval);
            if (fetchedApproval.signature == data.approval.signature) {
                logger.info (`Signatures match, passing approval to connector.`);
                await this.BL.reject(data, {logger});
                logger.info (`Connector approved, fetching the updated approval`);
                updatedApproval = await this.BL.getApproval(data.approval, {logger});
                if (updatedApproval) updatedApproval = this._addApprovalData(updatedApproval);
                return syncher.sync ([currentApproval], updatedApproval ? [updatedApproval] : [], {logger});
            }
            else
                throw `Reject failed for approval '${data.approval.private.id}'. data doesn't match in the source system`;
        }
        catch (ex) {
            var error = new Error ("Error rejecting approval");
            error.details = ex.message || ex;
            logger.error (`Error rejecting approval: ${error.details} \n ${ex.stack}`);
            var approvalList = [];
            if (updatedApproval) approvalList = [approvalList];
            else if (fetchedApproval) approvalList = [fetchedApproval];
            error.approvalSyncResult = syncher.sync ([currentApproval], approvalList, {logger}); //mark is as deleted
            throw error;
        }
    }
    async downloadAttachment (data, options){
        var logger = options.logger.child({component: "base-connector"});
        logger.info (`downloading attachment '${data.attachmentId}' of approval: '${data.approval.private.id}'`);
        var {data, mediaType} = await this.BL.downloadAttachment(data, {logger});
        return {data, contentType: mediaType};
    }

    /**
     * Allows to add aditional payload on each approval that is returned in the sync process.
     */
    setApprovalPayload(obj){
        this.additionalPayload = obj;
    }
}
