var Syncher = require ("./syncher.js");
var hashFunction = require('object-hash');
var jslt = require('jslt');
var LoggerClass = require ("./log").Logger;

exports.Connector = class Connector {
    constructor (options) {
        this.logger = options.logger.child({component: "connector-controller"});
        this.BL = require(process.cwd());
        this.BL.settings = this.BL.settings || {}
        this.signatureList = [];
        this.validateBL();
    }

    getBLLogger(logger) {
        if (!this.config.separateBlLog) return logger;
        logger.log ("BL log will be written in bl.log file");
        var bindings = LoggerClass.getLoggerBindings(logger);
        return (new LoggerClass(process.env.logStream, 'bl.log')).create({}).child(bindings);
    }

    /**
     * Checks the BL is valid, and answers to all the requirements, else, throws an exception
     */
    validateBL(){
        this.logger.info (`checking validity of the BL connector {${Object.keys(this.BL)}}`);
        var requiredMethods = ['init', 'stop', 'fetch', 'approve', 'reject', 'downloadAttachment'];
        var hasRequiredMethods = requiredMethods.every (method => method in this.BL);
        if (!hasRequiredMethods)
            throw new Error (`One or more of the required methods are missing in the BL connector: [${requiredMethods}] vs. [${requiredMethods}]`);
        if ((!this.BL.settings.selfValidation || !this.BL.settings.disableMiniSync) && !('getApproval' in this.BL))
            throw new Error (`'getApproval' method is missing in the BL Connector (selfValidation: ${this.BL.settings.selfValidation}, disableMiniSync: ${this.BL.settings.disableMiniSync})`);
		
    }

    _addApprovalData(approval, logger) {
		if (approval.error) return approval;
        if (this.config.schemaTransformer) {
			try {
				approval = jslt.transform(approval, this.config.schemaTransformer);
			} catch(ex) {
				logger.error(`Exception with transforming approval. ex=${ex}`);
				approval.error = "TransformException";
				return approval;
			}
		}

		approval.metadata = {
			fingerprints : this._createApprovalFingerprints(approval)
		};
		approval.systemUserId = approval.private.approver; //(todo) should be: hashFunction(approval.private.approver)
        approval.systemApprovalId = approval.private.id;
		return approval;
    }

    _createApprovalFingerprints(approval){
        var actionFingerprint = this.config.actionFingerprint;
        var fingerprints = {};
        fingerprints.sync = hashFunction(approval);
        if (actionFingerprint) {
			try {
				fingerprints.action = hashFunction(jslt.transform(approval, actionFingerprint))
			} catch(ex) {
				logger.error(`Error creating approval fingerprint action: ${(ex && ex.message) ? ex.message : ex}`);
			}
		}

        return fingerprints;
    }

    _compareActionFingerPrints(approval1, approval2) {
        if ("actionFingerprint" in this.config)
            return approval1.metadata.fingerprints.action === approval2.metadata.fingerprints.action;
        else
            return approval1.metadata.fingerprints.sync === approval2.metadata.fingerprints.sync;
    }

    async _performAction (type, data, options) {
        var logger = options.logger.child({component: "connector-controller", approvalId: data.approval.private.id});
        var blLogger = this.getBLLogger(logger);

        logger.info (`Performing action '${type}'`);
        var fetchedApproval, updatedApproval;
        var currentApproval = this.signatureList.find (approval => approval.id == data.approval.id);
        try {
            var validationPassed = false;

            if (!this.BL.settings.selfValidation) {
                logger.info("Action validation performed by controller");

                if (!this._compareActionFingerPrints(currentApproval, data.approval)) {
                    var error = new Error (`Action failed! approval doesn't match latest backend approval`);
                    error.error = "APPROVAL_DATA_MISMATCH";
                    throw error;
                }

                fetchedApproval = await this.BL.getApproval (data.approval, {logger : blLogger});
                if (!fetchedApproval) {
                    var error = new Error (`Approval was not returned from the connector`);
                    error.error = "APPROVAL_NOT_EXIST";
                    throw error;
                }
                fetchedApproval = this._addApprovalData(fetchedApproval, logger);

                validationPassed = this._compareActionFingerPrints(fetchedApproval, data.approval);
                if (!validationPassed) {
                    var error = new Error (`Action failed! approval doesn't match in the source system`);
                    error.error = "APPROVAL_DATA_MISMATCH";
                    error.fetchedApproval = fetchedApproval;
                    throw error;
                }
            }

            logger.info (`Passing approval '${data.approval.private.id}' to connector to perform action '${type}'`);
            try {
                await this.BL[type](data, {logger: blLogger});
            } catch (ex){
                var err = new Error (`Error performing action ${type}`);
                err.error = "CONNECTOR_ERROR";
                err.details = ex;
                throw err;
            }
            logger.info (`Connector performed action successfully!`);

            try {
                if (!this.BL.settings.disableMiniSync) {
                    logger.info(`Mini-sync: Fetching the updated approval`);
                    updatedApproval = await this.BL.getApproval(data.approval, {logger: blLogger});
                } else logger.info("Mini-sync disabled, marking the approval as deleted.");

                if (updatedApproval) updatedApproval = this._addApprovalData(updatedApproval, logger);
            }
            catch (ex) {
                logger.warn (`There was an error in the mini-sync: ${ex}, fallback -> updating approval as removed`);
            }
            finally {
                return Syncher.sync([currentApproval], updatedApproval ? [updatedApproval] : []);
            }

        }
        catch (ex) {
            const fetchedApprovalId = ex.fetchedApproval && ex.fetchedApproval.private && ex.fetchedApproval.private.id;
            var error = new Error (`Error performing action '${type}' for approval '${data.approval.private.id}'
                ${fetchedApprovalId ? ' (source approval id was ' + fetchedApprovalId + ')' : ''}: ${(ex.message || ex)}`);
            error.details = ex.message || ex;
            error.error = ex.error;
            logger.error ({code: error.error}, `Error performing approval action: ${error.details} \n ${ex.stack}`);
            error.approvalSyncResult = [];
            if (!('getApproval' in this.BL)) throw error;

            var approvalList = [currentApproval];
            if (updatedApproval) approvalList = [updatedApproval];
            else if (fetchedApproval) approvalList = [fetchedApproval];
            else if (fetchedApproval === null) approvalList = []; // in case of not exists approval. approval should be removed.
            approvalList ? error.approvalSyncResult = Syncher.sync([currentApproval], approvalList) : error.approvalSyncResult = [];
            throw error;
        }
    }

    async init(context){
        this.config = context.config.controllerConfig;
        return this.BL.init({config: context.config.blConfig, logger: this.getBLLogger(this.logger)});
    }

    async stop(){
        return this.BL.stop();
    }

    async sync(action){
        var logger = action.logger.child({component: "connector-controller"});
        var blLogger = this.getBLLogger(logger);
        logger.info(`syncing hash list (length = ${this.signatureList.length})`);

		const signatureList = [].concat(this.signatureList);
		const syncher = new Syncher(signatureList);
		
        return new Promise((resolve, reject) => {
			var processChunk = (approvalsChunk, hasMore) => {
				var approvals = approvalsChunk.approvals || approvalsChunk;
				var sendApprovals = syncher.syncChunk(approvals.map(approval => this._addApprovalData(approval, logger)));
				
				if (!hasMore) {
					if (!approvalsChunk.partialSync) sendApprovals = sendApprovals.concat(syncher.calcRemoved());
					logger.info(syncher.stats, "Sync statistics");
				}
				
				logger.info(`Syncing chunk. length=${sendApprovals.length} isLast=${!hasMore}`);
				action.send(sendApprovals);
				if (!hasMore) resolve();
			}

			var fetchRes = this.BL.fetch({ signatureList, logger : blLogger, fetchType : action.syncType }, (err, approvalsChunk, hasMore) => {
				if (err) return reject(err);
				processChunk(approvalsChunk, hasMore);						
			});
			
			if (fetchRes && typeof fetchRes.then == "function")
				fetchRes.then(processChunk, reject);
		});
    }
    async approve (data, options) {
        return this._performAction("approve", data, options);
    }
    async reject (data,options) {
        return this._performAction("reject", data, options);
    }
    async downloadAttachment (data, options){
        var logger = options.logger.child({component: "connector-controller"});
        var blLogger = this.getBLLogger(logger);
        logger.info (`downloading attachment '${data.attachmentId}' of approval: '${data.approval.private.id}'`);
        var {data, mediaType} = await this.BL.downloadAttachment(data, {logger : blLogger});
        return {data, contentType: mediaType};
    }
    async authenticate (data, options){
        var logger = options.logger.child({component: "connector-controller"});
        var blLogger = this.getBLLogger(logger);
        logger.info (`Authenticating: ${data.credentials && data.credentials.username}`);
        try {
            var res = await this.BL.authenticate(data.credentials, {logger : blLogger});
            if (!res){
                throw `Credentials authentication failed for ${data.credentials.username}`;
            }
        }
        catch (ex) {
            var error = Error (`Could not authenticate user. ` + (ex.message || ex));
            error.error = "AUTHENTICATION";
            throw error;
        }
    }
	
	async mapUserIds(data, options){
        var logger = options.logger.child({component: "connector-controller"});
        var blLogger = this.getBLLogger(logger);
        logger.info(`Mapping users: ${data.ids}`);
        try {
            var res = await this.BL.mapUserIds(data, {logger : blLogger});
            if (!res){
                throw `Mapping users failed for ${data.ids}`;
            }
        } catch (ex) {
            var error = new Error(`Could not map users. ` + (ex.message || ex));
            error.error = "CONNECTOR_ERROR";
            throw error;
        }
    }
}
