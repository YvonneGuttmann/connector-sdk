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

    static async init(context){
        config = context.config.controllerConfig;
        transform = context.transform || require('jslt').transform;
        BL = context.BL || require(process.cwd());

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

                var transformedApprovals = rawApprovals.map(approval => this._addApprovalData(approval));
                var approvals = syncher.syncChunk(transformedApprovals);

                for(var i = 0 ; i < approvals.length ; i++) {
                    var sendApproval = approvals[i];
                    if(BL.uiTemplates[sendApproval.schemaId]) {
                        var validationErr = this._uiTemplateValidation(sendApproval, BL.uiTemplates[sendApproval.schemaId]);
                        if(validationErr) {
                            let index = transformedApprovals.findIndex(a => a.private.id === sendApproval.private.id);
                            this.logger.debug(`Raw approval:\n${JSON.stringify(rawApprovals[index])}.\nTransformed approval:\n${JSON.stringify(sendApproval)}`)
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
        if(res instanceof Result.Success && res.data.data === undefined)
            return new Result.InternalError({}, { entity: "task", taskType: "downloadAttachment", message: `Failed to perform downloadAttachment - there is no data property in BL result!` });
        res.addMeta("entity", "attachment");
        return res;
    }

    async authenticate (data){
        this.logger.info (`Authenticating: ${data.credentials && data.credentials.username}`);
        var res = Result(await this.BL.authenticate(data.credentials, {}));
        if(res instanceof Result.Success && res.data.authenticated === undefined)
            return new Result.InternalError({}, { entity: "task", taskType: "authenticate", message: `Failed to perform authenticate - there is no authenticated property in BL result!` });
        res.addMeta("entity", "user");
        return res;
    }

    async mapUserIds(data){
        this.logger.info(`Mapping users: ${JSON.stringify(data.ids)}`);
        var res = Result(await this.BL.mapUserIds(data, {}));
        if(res instanceof Result.Success && !(res.data.users instanceof Array)) {
            return new Result.InternalError({}, { entity: "task", taskType: "mapUserIds", message: `Failed to perform mapUserIds - there is no users property in BL result!` });
        }
        return res;
    }

    async getApproval(data, options = {}){
        return await this._getApproval(data, options);
    }

    async _validateDataBeforeAction(approval) {
        this.logger.info("Action validation performed by controller");
        const res = await this._getApproval({approval});
        if(res instanceof Result.Success) {
            if(res.data.transformedApproval.error) {
                return new Result.BadArguments({}, { entity: "approval", message: res.data.transformedApproval.error });
            }
            const validationPassed = this._compareActionFingerPrints(res.data.transformedApproval, approval);
            if (!validationPassed) {
                return new Result.DataMismatch({ approvals: [res.data.transformedApproval] }, { entity: "approval" });
            }
        } else {
            if (res instanceof Result.NotFound) {
                res.addMeta("entity", "approval");
                res.data.approvals = [];
            }
        }
        return res;
    }

    // Transforms approval data if transformer.js file exists in the BL and add data to the approval
    _addApprovalData(approval) {
        if (approval.error || approval.deleted || approval.exists) return approval;

        try {
            approval = BL.dataTransformer(approval);
            if(!approval.schemaId || !approval.private || !approval.private.id || !approval.private.approver){
                throw "Exception with transforming approval: Invalid approval: missing schemaId or private data";
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

    // Validates transformed approval data with the UITemplate
    _uiTemplateValidation(approval, uiTemplate) {
        if(approval.error || approval.deleted) {
            return null;
        }
        try {
            var res = transform(approval.public, uiTemplate);
            if(res.jsltErrors) throw res.jsltErrors;
            return null;
        } catch (ex) {
            this.logger.error(`Approval uiTemplate data validation was failed: ${JSON.stringify(ex)}`);
            return ex;
        }
    }

    async _performAction (type, data) {
        this.logger.info (`Performing action '${type}'`);
        var transformedUpdatedApproval, rawUpdatedApproval;
        var currentApproval = signatureList.find (approval => approval.id == data.approval.id);

        if (!this._compareActionFingerPrints(currentApproval, data.approval)) {
            return new Result.DataMismatch({ approvalsData: { approvals: [] } }, { entity: "approval" });
        }

        this.logger.info (`Self validation: ${BL.settings.selfValidation ? "true" : "false, Getting approval..."}`);
        if(!BL.settings.selfValidation) {
            let dataValidationResult = await this._validateDataBeforeAction(data.approval);
            if(!(dataValidationResult instanceof Result.Success)) {
                if(dataValidationResult instanceof Result.NotFound || dataValidationResult instanceof Result.DataMismatch){
                    dataValidationResult.data = {
                        approvalsData:  {
                            approvals: Syncher.sync([currentApproval], dataValidationResult.data.approvals)
                        }
                    };
                }
                return dataValidationResult;
            }
        }

        this.logger.info (`Passing approval '${data.approval.private.id}' to connector to perform action '${type}'`);
        var actionResult = Result(await this.BL[type](data, {}));

        if(!(actionResult instanceof Result.Success)) {
            this.logger.info(`Action failed (${actionResult.status}): ${JSON.stringify(actionResult)}`);
            if(actionResult instanceof Result.DataMismatch) {
                actionResult.addMeta("entity", "approval");
                rawUpdatedApproval = actionResult.data.approval;
                transformedUpdatedApproval = this._addApprovalData(rawUpdatedApproval);
                this._uiTemplateValidation(transformedUpdatedApproval, BL.uiTemplates[transformedUpdatedApproval.schemaId]);
            }
        } else if (!BL.settings.disableMiniSync) {
            this.logger.info("Mini-sync enable, Getting approval...");
            var miniSyncResult = await this._getApproval(data);
            actionResult.addMeta("miniSyncStatus", miniSyncResult.status);
            if(miniSyncResult instanceof Result.Success) {
                rawUpdatedApproval = miniSyncResult.data.rawApproval;
                transformedUpdatedApproval = this._addApprovalData(rawUpdatedApproval);
                this._uiTemplateValidation(transformedUpdatedApproval, BL.uiTemplates[transformedUpdatedApproval.schemaId]);
            }
        } else {
            this.logger.info("Mini-sync disabled, marking the approval as deleted.");
        }

        actionResult.addMeta("entity", "approval");
        if(actionResult instanceof Result.Success || (BL.settings.selfValidation && (actionResult instanceof Result.NotFound || actionResult instanceof Result.DataMismatch))) {
            const sendApprovals = Syncher.sync([currentApproval], transformedUpdatedApproval ? [transformedUpdatedApproval] : []);
            actionResult.data = {
                approvalsData: {
                    approvals: sendApprovals,
                    rawApprovals: rawUpdatedApproval ? [rawUpdatedApproval] : [],
                    transformedApprovals: transformedUpdatedApproval ? [transformedUpdatedApproval] : []
                }
            };
        }

        return actionResult;
    }

    async _getApproval(data, options = {}) {
        this.logger.info(`Getting approval ${data.approval.private.id}`);
        var res = Result(await this.BL.getApproval(data.approval, options));
        if(res instanceof Result.Success && res.data.approval === undefined)
            return new Result.InternalError({}, { entity: "task", message: `Failed to perform getApproval - there is no approval property in BL result!` });
        else if(res instanceof Result.Success) {
            var rawApproval = res.data.approval;
            var transformedApproval = this._addApprovalData(rawApproval);
            return new Result.Success({rawApproval, transformedApproval})
        } else {
            return res;
        }
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

};

function identityTransform(a) {
    return a;
}
