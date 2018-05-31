var Syncher = require ("./syncher.js");
var hashFunction = require('object-hash');
var jslt = require('jslt');
var LoggerClass = require ("./log").Logger;
var BL, config, signatureList = [];

exports.Connector = class Connector {
    constructor(options) {
        this.logger = options.logger.child({component: "connector-controller"});
		this.BL = new BL({ logger : this.getBLLogger() });
    }

    getBLLogger() {
        if (!config.separateBlLog) return this.logger;
        this.logger.log("BL log will be written in bl.log file");
        var bindings = LoggerClass.getLoggerBindings(this.logger);
        return (new LoggerClass(process.env.logStream, 'bl.log')).create({}).child(bindings);
    }

    // Transforms approval data if transformer.js file exists in the BL and add data to the approval
    _addApprovalData(approval) {
        if (approval.error) return approval;

        try {
            approval = BL.dataTransformer(approval);
            if(!approval.schemaId || !approval.private || !approval.private.id || !approval.private.approver)
				throw "Invalid approval: missing schemaId or private data";
        } catch (ex) {
            this.logger.error(`Exception with transforming approval. ex=${ex}`);
            this.logger.debug(`Approval:\n${JSON.stringify(approval)}`);
            approval.error = "TransformException";
            return approval;
        }

        approval.metadata = {
            fingerprints : this._createApprovalFingerprints(approval)
        };
        approval.systemUserId = approval.private.approver; //(todo) should be: hashFunction(approval.private.approver)
        approval.systemApprovalId = approval.private.id;
        return approval;
    }

    // Creates fingerprints (hash) for sync and action
    _createApprovalFingerprints(approval){
        var actionFingerprint = config.actionFingerprint;
        var fingerprints = {};
        fingerprints.sync = hashFunction(approval);
        if (actionFingerprint) {
            try {
                fingerprints.action = hashFunction(jslt.transform(approval, actionFingerprint))
            } catch(ex) {
                this.logger.error(`Error creating approval fingerprint action: ${(ex && ex.message) ? ex.message : ex}`);
            }
        }

        return fingerprints;
    }

    _compareActionFingerPrints(approval1, approval2) {
        if ("actionFingerprint" in config)
            return approval1.metadata.fingerprints.action === approval2.metadata.fingerprints.action;
        else
            return approval1.metadata.fingerprints.sync === approval2.metadata.fingerprints.sync;
    }

    // Validates approval data with the UITemplate. Returns null if succeeded, else - returns error.
    _validateApprovalData(approval, UITemplate) {
        try {
            jslt.transform(approval.public, UITemplate);
            return null;
        } catch (ex) {
            this.logger.error(`Exception with validate approval. ex=${ex}`);
            this.logger.debug(`Data validation error.\napproval:\n${JSON.stringify(approval)}\nUITemplate:\n${UITemplate} `);
            // approval.error = "DataValidationException";
            return ex;
        }
    }

    async _performAction (type, data, options) {
        this.logger.info (`Performing action '${type}'`);
        var fetchedApproval, updatedApproval, rawApproval, rawUpdatedApproval;
        var currentApproval = signatureList.find (approval => approval.id == data.approval.id);
        try {
            var validationPassed = false;

            if (!BL.settings.selfValidation) {
                this.logger.info("Action validation performed by controller");

                if (!this._compareActionFingerPrints(currentApproval, data.approval)) {
                    var error = new Error (`Action failed! approval doesn't match latest backend approval`);
                    error.error = "APPROVAL_DATA_MISMATCH";
                    throw error;
                }

                rawApproval = await this.BL.getApproval (data.approval, {});
                if (!rawApproval) {
                    var error = new Error (`Approval was not returned from the connector`);
                    error.error = "APPROVAL_NOT_EXIST";
                    throw error;
                }

                fetchedApproval = this._addApprovalData(rawApproval);
                validationPassed = this._compareActionFingerPrints(fetchedApproval, data.approval);
                if (!validationPassed) {
                    var error = new Error (`Action failed! approval doesn't match in the source system`);
                    error.error = "APPROVAL_DATA_MISMATCH";
                    error.fetchedApproval = fetchedApproval;
                    throw error;
                }
            }

            this.logger.info (`Passing approval '${data.approval.private.id}' to connector to perform action '${type}'`);
            try {
                await this.BL[type](data, {});
            } catch (ex){
                var err = new Error (`Error performing action ${type}`);
                err.error = "CONNECTOR_ERROR";
                err.details = ex;
                throw err;
            }
            this.logger.info (`Connector performed action successfully!`);

            try {
                if (!BL.settings.disableMiniSync) {
                    this.logger.info(`Mini-sync: Fetching the updated approval`);
                    rawUpdatedApproval = await this.BL.getApproval(data.approval, {});
                } else this.logger.info("Mini-sync disabled, marking the approval as deleted.");

                if (rawUpdatedApproval) updatedApproval = this._addApprovalData(rawUpdatedApproval);

                if(updatedApproval) {
                    var uiTemplate = await options.getUITemplate(fetchedApproval.schemaId);
                    if(uiTemplate) {
                        let dataValidationError = this._validateApprovalData(updatedApproval, uiTemplate);
                        if(dataValidationError) {
                            var error = new Error (`Mini-sync failed! approval validation data was failed: ${dataValidationError}`);
                            this.logger.debug(`Before:\n${JSON.stringify(rawUpdatedApproval)}.\nAfter:\n${JSON.stringify(updatedApproval)}`);
                            error.error = "APPROVAL_DATA_VALIDATION";
                            error.fetchedApproval = fetchedApproval;
                            throw error;
                        }
                    }
                }

            }
            catch (ex) {
                this.logger.warn (`There was an error in the mini-sync: ${ex}, fallback -> updating approval as removed`);
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
            else if (rawApproval === null) approvalList = []; // in case of not exists approval. approval should be removed.
            approvalList ? error.approvalSyncResult = Syncher.sync([currentApproval], approvalList) : error.approvalSyncResult = [];
            throw error;
        }
    }

    static async init(context){
        config = context.config.controllerConfig;

		BL = require(process.cwd());
		if (typeof BL == "object") BL = classifyBL(BL);

        try {
            BL.dataTransformer = require(`${process.cwd()}/resources/transformer.js`);
            if(typeof BL.dataTransformer === "object") {
                let jsltTemplate = BL.dataTransformer;
                BL.dataTransformer = ((approval) => jslt.transform(approval, jsltTemplate));
            }
        } catch (err) {
            context.logger.log(`transformer.js is not exists`);
            BL.dataTransformer = identityTransform;
        }
		
        // for backward compatibility
        if (config.schemaTransformer) {
            BL.dataTransformer = ((approval) => jslt.transform(approval, config.schemaTransformer));
        }
		
        BL.settings = BL.settings || {};
        Connector.validateBL();
		signatureList = [];
		
        return BL.init({config: context.config.blConfig, logger: context.logger});
    }

    static async stop(){
		if (BL) {
			await BL.stop();
			BL = null;
		}
    }

    // Checks the BL is valid, and answers to all the requirements, else, throws an exception
    static validateBL(){
//        this.logger.info (`checking validity of the BL connector {${Object.keys(BL.prototype)}}`);
		if (!('init' in BL && 'stop' in BL))
			throw new Error (`'init'/'stop' method is missing in the BL Connector`);
		
        var requiredMethods = ['fetch', 'approve', 'reject', 'downloadAttachment'];
        var hasRequiredMethods = requiredMethods.every (method => method in BL.prototype);
        if (!hasRequiredMethods)
            throw new Error (`One or more of the required methods are missing in the BL connector: [${requiredMethods}] vs. [${requiredMethods}]`);
		
        if ((!BL.settings.selfValidation || !BL.settings.disableMiniSync) && !('getApproval' in BL.prototype))
            throw new Error (`'getApproval' method is missing in the BL Connector (selfValidation: ${BL.settings.selfValidation}, disableMiniSync: ${BL.settings.disableMiniSync})`);
    }

	setSignatureList(sigList) {
		signatureList = sigList;
	}

    async sync(action){
        this.logger.info(`syncing hash list (length = ${signatureList.length})`);

        const sigList = [].concat(signatureList);
        const syncher = new Syncher(sigList);
        var UITemplates = {};

        return new Promise((resolve, reject) => {
            var processChunk = async (approvalsChunk, hasMore) => {
                var rawApprovals = approvalsChunk.approvals || approvalsChunk;

                var transformedApprovals = rawApprovals.map(approval => this._addApprovalData(approval));
                var sendApprovals = syncher.syncChunk(transformedApprovals);

                for(var i = 0 ; i < sendApprovals.length ; i++) {

                    var sendApproval = sendApprovals[i];

                    if(!sendApproval.deleted) {
                        if(!UITemplates[sendApproval.schemaId] && UITemplates[sendApproval.schemaId] !== null)
                            UITemplates[sendApproval.schemaId] = await action.getUITemplate(sendApproval.schemaId);

                        if(UITemplates[sendApproval.schemaId]) {
                            var validationErr = this._validateApprovalData(sendApproval, UITemplates[sendApproval.schemaId]);
                            if(validationErr) {
                                let index = transformedApprovals.findIndex(a => a.private.id === sendApproval.private.id);
                                this.logger.error(`Approval data validation failed.`);
                                this.logger.debug(`Raw approval:\n${JSON.stringify(rawApprovals[index])}.\nTransformed approval:\n${JSON.stringify(sendApproval)}`)
                            }
                        }
                    }
                }

                if (!hasMore) {
                    if (!approvalsChunk.partialSync) sendApprovals = sendApprovals.concat(syncher.calcRemoved());
                    this.logger.info(syncher.stats, "Sync statistics");
                    syncher.destroy();
                }

                // sendApprovals = sendApprovals.filter(a => !a.error);
                this.logger.info(`Syncing chunk. length=${sendApprovals.length} isLast=${!hasMore}`);
                action.send(sendApprovals, rawApprovals);
                if (!hasMore) {
                    UITemplates = {};
                    resolve();
                }
            };

            function failedFetch(err) {
                syncher.destroy();
                UITemplates = {};
                reject(err);
            };

            var fetchRes = this.BL.fetch({ signatureList : sigList, fetchType : action.syncType }, (err, approvalsChunk, hasMore) => {
                if (err) return failedFetch(err);
                processChunk(approvalsChunk, hasMore);
            });

            if (fetchRes && typeof fetchRes.then == "function")
                fetchRes.then(processChunk).catch(failedFetch);
        });
    }

    async approve (data, options) {
        return this._performAction("approve", data, options);
    }

    async reject (data,options) {
        return this._performAction("reject", data, options);
    }

    async additionalActions (data, options) {
        if(!this.BL[data.action]) {
            var error =  new Error(`${data.action} was not implemented in the BL`);
            error.error = `TASK_INVALID`;
            throw error;
        }

        return this._performAction(data.action, data, options);
    }

    async downloadAttachment (data, options){
        this.logger.info (`downloading attachment '${data.attachmentId}' of approval: '${data.approval.private.id}'`);
        var {data, mediaType} = await this.BL.downloadAttachment(data, {});
        return {data, contentType: mediaType};
    }

    async authenticate (data, options){
        this.logger.info (`Authenticating: ${data.credentials && data.credentials.username}`);
        try {
            var res = await this.BL.authenticate(data.credentials, {});
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
        this.logger.info(`Mapping users: ${JSON.stringify(data.ids)}`);
        try {
            var res = await this.BL.mapUserIds(data, {});
            if (!res){
                throw `Mapping users failed for ${data.ids}`;
            }
            return res;
        } catch (ex) {
            var error = new Error(`Could not map users. ` + (ex.message || ex));
            error.error = "CONNECTOR_ERROR";
            throw error;
        }
    }
};

function identityTransform(a) {
    return a;
}

function classifyBL(bl) {
	class BLClass {
		constructor(options) {
			this.logger = options.logger;
		}
		
		static init(context) {
			return bl.init && bl.init(context);
		}
		
		static stop() {
			return bl.stop && bl.stop();
		}		
	};
	
	if (bl.fetch) BLClass.prototype.fetch = function(options, callback) {
		options.logger = this.logger;
		return bl.fetch(options, callback);
	};

	if (bl.approve) BLClass.prototype.approve = function(data, options) {
		options.logger = this.logger;
		return bl.approve(data, options);
	};
	
	if (bl.reject) BLClass.prototype.reject = function(data, options) {
		options.logger = this.logger;
		return bl.reject(data, options);
	};

	if (bl.getApproval) BLClass.prototype.getApproval = function(data, options) {
		options.logger = this.logger;
		return bl.getApproval(data, options);
	};

	if (bl.downloadAttachment) BLClass.prototype.downloadAttachment = function(data, options) {
		options.logger = this.logger;
		return bl.downloadAttachment(data, options);
	};

	if (bl.authenticate) BLClass.prototype.authenticate = function(data, options) {
		options.logger = this.logger;
		return bl.authenticate(data, options);
	};

	if (bl.mapUserIds) BLClass.prototype.mapUserIds = function(data, options) {
		options.logger = this.logger;
		return bl.mapUserIds(data, options);
	};
	
	return BLClass;
}
