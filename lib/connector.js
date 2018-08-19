var Syncher = require ("./syncher.js");
var hashFunction = require('object-hash');
var Result = require('./Result');
var LoggerClass = require ("./log").Logger;
var BL, config, transform, signatureList = [];
var TASK_TYPES = ['fetch', 'approve', 'reject', 'downloadAttachment', 'authenticate', 'mapUserIds'];
var path = require("path");
var testFlow;

exports.Connector = class Connector {
    constructor(options) {
        this.logger = options.logger.child({component: "connector-controller"});
        this.taskId = options.taskId;

		var blLogger = this.logger;
		if (config.separateBlLog && process.env.logStream == "file")
			blLogger = this._blLogger = LoggerClass.duplicate(this.logger, "bl.log");

        this.BL = new BL({ logger : blLogger, logPath : process.env.logStream === "file" && blLogger.caprizaLogFile && path.dirname(blLogger.caprizaLogFile), flow: testFlow});
    }

	async destroy() {
		if (this.BL.destroy) {
			try {
				await this.BL.destroy();
			} catch(ex) {
				 this.logger.error(`Exception in BL.destroy(). ex=${ex}`);
			}
		}
		
		if (this._blLogger && this._blLogger.caprizaStream) {
			this._blLogger.caprizaStream.end();
			this._blLogger = null;
		}
	}
	
    // Transforms approval data if transformer.js file exists in the BL and add data to the approval
    addApprovalData(approval) {
        if (approval.error || approval.deleted || approval.exists) return approval;

        try {
            approval = BL.dataTransformer(approval);
            if(!approval.schemaId || !approval.private || !approval.private.id || !approval.private.approver){
                throw "Invalid approval: missing schemaId or private data";
            }
        } catch (ex) {
            this.logger.error(`Exception with transforming approval. ex=${ex}`);
            this.logger.debug(`Approval:\n${JSON.stringify(approval)}`);
            approval.error = ex || ex.message;
            return approval;
        }

        approval.metadata = {
            fingerprints : this._createApprovalFingerprints(approval),
            taskId : this.taskId
    };
        approval.systemUserId = approval.private.approver; //(todo) should be: hashFunction(approval.private.approver)
        approval.systemApprovalId = approval.private.id;
        return approval;
    }

    static async init(context){
        config = context.config.controllerConfig;
        transform = context.transform || require('jslt').transform;
        BL = context.BL || require(process.cwd());
        if (typeof BL == "object") BL = classifyBL(BL);

        if(context.uiTemplates) {
            BL.uiTemplates = context.uiTemplates;
        } else {
            context.logger.error("Connector initialize without UI template");
            BL.uiTemplates = {};
        }

        try {
            BL.dataTransformer = context.transformer || require(`${process.cwd()}/resources/transformer.js`);
            if(typeof BL.dataTransformer === "object") {
                let jsltTemplate = BL.dataTransformer;
                BL.dataTransformer = ((approval) => transform(approval, jsltTemplate));
            }
        } catch (err) {
            context.logger.log(`transformer.js is not exists`);
            BL.dataTransformer = identityTransform;
        }
		
        // for backward compatibility
        if (config.schemaTransformer) {
            BL.dataTransformer = ((approval) => transform(approval, config.schemaTransformer));
        }
		
        BL.settings = BL.settings || {};
        Connector.validateBL();
		signatureList = [];

		// for testing. if test scenario -> load test flow
		if(context.testFlow) {
            testFlow = context.testFlow;
        }
		
        await BL.init({config: context.config.blConfig, logger: context.logger, Result});
		var taskTypes = Object.getOwnPropertyNames(BL.prototype)
            .filter(k => {
                if(TASK_TYPES.includes(k)) return true;
                if(k.startsWith("action$")) return true;
            })
            .map(k => {
                if(k === "fetch") return "sync";
                else if(k === "downloadAttachment") return "getAttachment";
                else return k;
        });
        taskTypes.push('sendFeedback');
        return taskTypes;
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

        return new Promise((resolve, reject) => {
            var processChunk = async (approvalsChunk, hasMore) => {
                approvalsChunk = Result(approvalsChunk);

                if(approvalsChunk.data.approvals === undefined)
                    return resolve(new Result.InternalError({}, { entity: "task", "taskType": "sync" ,message: `Failed to perform sync - there is no approvals property in BL result!` }));

                if(!(approvalsChunk instanceof Result.Success)) {
                    approvalsChunk.addMeta("taskType", "sync");
                    return resolve(approvalsChunk);
                }

                var rawApprovals = approvalsChunk.data.approvals || [];

                var transformedApprovals = rawApprovals.map(approval => this.addApprovalData(approval));
                var approvals = syncher.syncChunk(transformedApprovals);

                for(var i = 0 ; i < approvals.length ; i++) {

                    var sendApproval = approvals[i];

                    if(!sendApproval.deleted) {
                        if(BL.uiTemplates[sendApproval.schemaId]) {
                            var validationErr = this._validateApprovalData(sendApproval, BL.uiTemplates[sendApproval.schemaId]);
                            if(validationErr) {
                                let index = transformedApprovals.findIndex(a => a.private.id === sendApproval.private.id);
                                this.logger.error(`Approval data validation failed.`);
                                this.logger.debug(`Raw approval:\n${JSON.stringify(rawApprovals[index])}.\nTransformed approval:\n${JSON.stringify(sendApproval)}`)
                            }
                        }
                    }
                }

                if (!hasMore) {
                    if (!approvalsChunk.data.partialSync) approvals = approvals.concat(syncher.calcRemoved());
                    this.logger.info(syncher.stats, "Sync statistics");
                    syncher.destroy();
                }

                this.logger.info(`Syncing chunk. length=${approvals.length} isLast=${!hasMore}`);
                action.send({approvals, rawApprovals, transformedApprovals});
                if (!hasMore) {
                    resolve(new Result.Success());
                }
            };

            function failedFetch(err) {
                syncher.destroy();
                reject(err);
            }

            var fetchRes = this.BL.fetch({ signatureList : sigList, fetchType : action.syncType }, (err, res, hasMore) => {
                if (err) return failedFetch(err);
                processChunk(res, hasMore);
            });

            if (fetchRes && typeof fetchRes.then == "function")
                fetchRes.then(processChunk).catch(failedFetch);
        });
    }

    async approve (data) {
        return this._performAction("approve", data);
    }

    async reject (data) {
        return this._performAction("reject", data);
    }

    async additionalActions (data) {
        if(!this.BL[data.action]) {
            this.logger.error(`${data.action} was not implemented in the BL`);
            return new Result.NotImplemented({}, { entity: 'task', taskType: data.action, message: `${data.action} was not implemented in the BL` });
        }

        return this._performAction(data.action, data);
    }

    async downloadAttachment (data){
        this.logger.info (`downloading attachment '${data.attachmentId}' of approval: '${data.approval.private.id}'`);
        var res =  Result(await this.BL.downloadAttachment(data, {}));
        if(res.data.data === undefined)
            return new Result.InternalError({}, { entity: "task", taskType: "downloadAttachment", message: `Failed to perform downloadAttachment - there is no data property in BL result!` });
        res.addMeta("entity", "attachment");
        return res;
    }

    async authenticate (data){
        this.logger.info (`Authenticating: ${data.credentials && data.credentials.username}`);
        var res = Result(await this.BL.authenticate(data.credentials, {}));
        if(res.data.authenticated === undefined)
            return new Result.InternalError({}, { entity: "task", taskType: "authenticate", message: `Failed to perform authenticate - there is no authenticated property in BL result!` });
        res.addMeta("entity", "user");
        return res;
    }

    async mapUserIds(data){
        this.logger.info(`Mapping users: ${JSON.stringify(data.ids)}`);
        var res = Result(await this.BL.mapUserIds(data, {}));
        if(!(res.data.users instanceof Array)) {
            return new Result.InternalError({}, { entity: "task", taskType: "mapUserIds", message: `Failed to perform mapUserIds - there is no users property in BL result!` });
        }
        return res;
    }

    async getApproval(data, options = {}){
        var res = Result(await this.BL.getApproval(data.approval, options));
        if(res.data.approval === undefined)
            return new Result.InternalError({}, { entity: "task", message: `Failed to perform getApproval - there is no approval property in BL result!` });

        var rawUpdatedApproval = res.data.approval,
            transformedApproval = rawUpdatedApproval && this.addApprovalData(rawUpdatedApproval);

        return {rawUpdatedApproval, transformedApproval}
    }

    async _validateDataBeforeAction(approval) {
        this.logger.info("Action validation performed by controller");
        const res = Result(await this.BL.getApproval (approval, { approvals: [] }));

        if(!(res instanceof Result.Success)) {
            if (res instanceof Result.NotFound) {
                res.addMeta("entity", "approval");
                res.data.approvals = [];
            }
            return res;
        }

        const fetchedApproval = this.addApprovalData(res.data.approval);
        const validationPassed = this._compareActionFingerPrints(fetchedApproval, approval);
        if (!validationPassed) {
            return new Result.DataMismatch({ approvals: [fetchedApproval] }, { entity: "approval" });
        }

        return new Result.Success();
    }

    _processApproval(approval) {
        let updatedApproval = this.addApprovalData(approval);
        let dataValidationError = this._validateApprovalData(updatedApproval, BL.uiTemplates);
        if(dataValidationError) {
            this.logger.error(`Approval uiTemplate data validation was failed: ${dataValidationError}`);
            this.logger.debug(`Before:\n${JSON.stringify(approval)}.\nAfter:\n${JSON.stringify(updatedApproval)}`);
        }
        return updatedApproval;
    }

    async _performAction (type, data) {
        this.logger.info (`Performing action '${type}'`);
        var updatedApproval, rawUpdatedApproval;
        var currentApproval = signatureList.find (approval => approval.id == data.approval.id);

        if (!this._compareActionFingerPrints(currentApproval, data.approval)) {
            return new Result.DataMismatch({ approvalsData: { approvals: [] } }, { entity: "approval" });
        }

        this.logger.info (`Self validation: ${BL.settings.selfValidation ? "true" : "false, Getting approval..."}`);
        if(!BL.settings.selfValidation) {
            let dataValidationResult = await this._validateDataBeforeAction(data.approval);
            if(dataValidationResult instanceof Result.NotFound || dataValidationResult instanceof Result.DataMismatch){
                dataValidationResult.data = {
                    approvalsData:  {
                        approvals: Syncher.sync([currentApproval], dataValidationResult.data.approvals)
                    }
                };
                return dataValidationResult;
            }
        }

        this.logger.info (`Passing approval '${data.approval.private.id}' to connector to perform action '${type}'`);
        var actionResult = Result(await this.BL[type](data, {}));

        if(!(actionResult instanceof Result.Success)) {
            this.logger.info(`Action failed: ${JSON.stringify(actionResult)}`);
            if(actionResult instanceof Result.DataMismatch) {
                actionResult.addMeta("entity", "approval");
                rawUpdatedApproval = actionResult.data.approval;
                updatedApproval = this._processApproval(rawUpdatedApproval);
            }

        } else if (!BL.settings.disableMiniSync) {
            this.logger.info("Mini-sync enable, Getting approval...");
            var miniSyncResult = Result(await this.BL.getApproval(data.approval, {}));
            actionResult.addMeta("miniSyncStatus", miniSyncResult.status);
            if(miniSyncResult instanceof Result.Success) {
                rawUpdatedApproval = miniSyncResult.data.approval;
                if (rawUpdatedApproval) {
                    updatedApproval = this._processApproval(rawUpdatedApproval);
                } else {
                    this.logger.info("Mini-sync done, approval is not in pending status -> mark as deleted");
                }
            }

        } else {
            this.logger.info("Mini-sync disabled, marking the approval as deleted.");
        }
        actionResult.addMeta("entity", "approval");
        if(actionResult instanceof Result.Success || actionResult instanceof Result.NotFound || actionResult instanceof Result.DataMismatch) {
            const sendApprovals = Syncher.sync([currentApproval], updatedApproval ? [updatedApproval] : []);
            actionResult.data = {
                approvalsData: {
                    approvals: sendApprovals,
                    rawApprovals: rawUpdatedApproval ? [rawUpdatedApproval] : [],
                    transformedApprovals: updatedApproval ? [updatedApproval] : []
                }
            };
        }

        return actionResult;
    }

    // Creates fingerprints (hash) for sync and action
    _createApprovalFingerprints(approval){
        var actionFingerprint = config.actionFingerprint;
        var fingerprints = {};
        fingerprints.sync = hashFunction(approval);
        if (actionFingerprint) {
            try {
                fingerprints.action = hashFunction(transform(approval, actionFingerprint))
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
            transform(approval.public, UITemplate);
            return null;
        } catch (ex) {
            this.logger.error(`Exception with validate approval. ex=${ex}`);
            this.logger.debug(`Data validation error.\napproval:\n${JSON.stringify(approval)}\nUITemplate:\n${UITemplate} `);
            // approval.error = "DataValidationException";
            return ex;
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
	
	if (bl.settings) BLClass.settings = bl.settings;
	
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
