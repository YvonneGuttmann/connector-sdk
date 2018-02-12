var syncher = require ("./syncher.js");
var hashFunction = require('object-hash');
var jslt = require('jslt');

exports.Connector = class Connector {
    constructor () {
        this.BL = require(process.cwd());
        this.BL.settings = this.BL.settings || {}
        this.signatureList = [];
    }

    _addApprovalData (approval, logger) {
        if (this.config.schemaTransformer) approval = jslt.transform(approval, this.config.schemaTransformer);

        approval.metadata = {};

        try {
            approval.metadata.fingerprints = this._createApprovalFingerprints(approval);
        }
        catch (ex){
            logger.error (`Error creating approval fingerprint: ${(ex && ex.message) ? ex.message : ex}`);
        }
        approval.systemUserId = approval.private.approver; //(todo) should be: hashFunction(approval.private.approver)
        return approval;
    }

    _createApprovalFingerprints(approval){
        var actionFingerprint = this.config.actionFingerprint;
        var fingerprints = {};
        fingerprints.sync = hashFunction(approval);
        if (actionFingerprint) fingerprints.action = hashFunction(jslt.transform(approval, actionFingerprint))

        return fingerprints;
    }

    _compareActionFingerPrints (approval1, approval2) {
        if ("actionFingerprint" in this.config)
            return approval1.metadata.fingerprints.action === approval2.metadata.fingerprints.action;
        else
            return approval1.metadata.fingerprints.sync === approval2.metadata.fingerprints.sync;
    }

    async _performAction (type, data, options) {
        var logger = options.logger.child({component: "connector-controller", approvalId: data.approval.private.id});

        logger.info (`Performing action '${type}'`);
        var fetchedApproval, updatedApproval;
        var currentApproval = this.signatureList.find (approval => approval.id == data.approval.id);
        try {
            var validationPassed = false;

            if (!this.BL.settings.selfValidation) {
                logger.info("Action validation performed by controller");

                if (!this._compareActionFingerPrints(currentApproval, data.approval)) {
                    throw `Action failed! approval doesn't match latest backend approval`;
                }
                fetchedApproval = await this.BL.getApproval(data.approval, {logger});
                if (!fetchedApproval) throw `Approval was not returned from the connector`;
                fetchedApproval = this._addApprovalData(fetchedApproval, logger);
                validationPassed = this._compareActionFingerPrints(fetchedApproval, data.approval);
                if (!validationPassed) throw `Action failed! approval doesn't match in the source system`;
            }

            logger.info (`Passing approval '${data.approval.private.id}' to connector to perform action '${type}'`);
            await this.BL[type](data, {logger});
            logger.info (`Connector performed action successfully!`);

            if (this.BL.settings.selfValidation) return []; //selfValidation doesn't fetches the update approval.

            logger.info(`Fetching the updated approval`);
            updatedApproval = await this.BL.getApproval(data.approval, {logger});
            if (updatedApproval) updatedApproval = this._addApprovalData(updatedApproval, logger);
            return syncher.sync ([currentApproval], updatedApproval ? [updatedApproval] : [], {logger});

        }
        catch (ex) {
            var error = new Error (`Error performing action '${type}' for approval '${data.approval.private.id}': ${(ex.message || ex)}`);
            error.details = ex.message || ex;
            logger.error (`Error performing approval action: ${error.details} \n ${ex.stack}`);
            error.approvalSyncResult = [];
            if (this.BL.settings.selfValidation) throw error;

            var approvalList;
            if (updatedApproval) approvalList = [approvalList];
            else if (fetchedApproval) approvalList = [fetchedApproval];
            approvalList ? error.approvalSyncResult = syncher.sync ([currentApproval], approvalList, {logger}) : error.approvalSyncResult = [];
            throw error;
        }
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
        approvals = approvals.map (approval => this._addApprovalData(approval, logger));
        return syncher.sync (this.signatureList, approvals, {logger});
    }
    async approve (data, options) {
        return this._performAction("approve", data, options);
    }
    async reject (data,options) {
        return this._performAction("reject", data, options);
    }
    async downloadAttachment (data, options){
        var logger = options.logger.child({component: "connector-controller"});
        logger.info (`downloading attachment '${data.attachmentId}' of approval: '${data.approval.private.id}'`);
        var {data, mediaType} = await this.BL.downloadAttachment(data, {logger});
        return {data, contentType: mediaType};
    }
    async authenticate (data, options){
        var logger = options.logger.child({component: "connector-controller"});
        logger.info (`Authenticating: ${data.credentials && data.credentials.username}`);
        try {
            var res = await this.BL.authenticate(data.credentials, {logger});
            if (!res){
                throw `Credentials authentication failed for ${data.credentials.username}`;
            }
        }
        catch (ex) {
            throw new Error (`Could not authenticate user. ` + (ex.message || ex));
        }
    }
    /**
     * Allows to add aditional payload on each approval that is returned in the sync process.
     */
    setApprovalPayload(obj){
        this.additionalPayload = obj;
    }
}
