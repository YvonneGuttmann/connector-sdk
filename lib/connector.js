var Syncher = require ("./syncher.js");
var hashFunction = require('object-hash');
var jslt = require('jslt');
var LoggerClass = require ("./log").Logger;

exports.Connector = class Connector {
    constructor (options) {
        this.logger = options.logger.child({component: "connector-controller"});
        this.BL = require(process.cwd());
        try {
            this.BL.dataTransformer = require(`${process.cwd()}/resources/transformer.js`);
            if(typeof this.BL.dataTransformer === "object") {
                let jsltTemplate = this.BL.dataTransformer;
                this.BL.dataTransformer = ((approval) => jslt.transform(approval, jsltTemplate));
            }
        } catch (err) {
            this.logger.log(`transformer.js is not exists`);
            this.BL.dataTransformer = identityTransform;
        }
        this.BL.settings = this.BL.settings || {};
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

    /**
     * Transforms approval data if transformer.js file exists in the BL and add data to the approval
     */
    _addApprovalData(approval, logger) {
        if (approval.error) return approval;

        try {
            approval = this.BL.dataTransformer(approval);
            if(!approval.schemaId || !approval.private || !approval.private.id || !approval.private.approver) throw "Invalid approval: missing schemaId or private data";
        } catch (ex) {
            logger.error(`Exception with transforming approval. ex=${ex}`);
            logger.debug(`Approval:\n${JSON.stringify(approval)}`);
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

    /**
     * Creates fingerprints (hash) for sync and action
     */
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

    /**
     * Validates approval data with the UITemplate.
     * Returns null if succeeded, else - returns error.
     */
    _validateApprovalData(approval, UITemplate, logger) {
        try {
            jslt.transform(approval.public, UITemplate);
            return null;
        } catch (ex) {
            logger.error(`Exception with validate approval. ex=${ex}`);
            logger.debug(`Data validation error.\napproval:\n${JSON.stringify(approval)}\nUITemplate:\n${UITemplate} `);
            // approval.error = "DataValidationException";
            return ex;
        }
    }

    async _performAction (type, data, options) {
        var logger = options.logger.child({component: "connector-controller", approvalId: data.approval.private.id});
        var blLogger = this.getBLLogger(logger);

        logger.info (`Performing action '${type}'`);
        var fetchedApproval, updatedApproval, rawApproval, rawUpdatedApproval;
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

                rawApproval = await this.BL.getApproval (data.approval, {logger : blLogger});
                if (!rawApproval) {
                    var error = new Error (`Approval was not returned from the connector`);
                    error.error = "APPROVAL_NOT_EXIST";
                    throw error;
                }

                fetchedApproval = this._addApprovalData(rawApproval, logger);
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
                logger.error(ex.stack);
                var err = new Error (`Error performing action ${type}`);
                err.error = "CONNECTOR_ERROR";
                err.details = ex;
                throw err;
            }
            logger.info (`Connector performed action successfully!`);

            try {
                if (!this.BL.settings.disableMiniSync) {
                    logger.info(`Mini-sync: Fetching the updated approval`);
                    rawUpdatedApproval = await this.BL.getApproval(data.approval, {logger: blLogger});
                } else logger.info("Mini-sync disabled, marking the approval as deleted.");

                if (rawUpdatedApproval) updatedApproval = this._addApprovalData(rawUpdatedApproval, logger);

                if(updatedApproval) {
                    var uiTemplate = await options.getUITemplate(fetchedApproval.schemaId);
                    if(uiTemplate) {
                        let dataValidationError = this._validateApprovalData(updatedApproval, uiTemplate, logger);
                        if(dataValidationError) {
                            var error = new Error (`Mini-sync failed! approval validation data was failed: ${dataValidationError}`);
                            logger.debug(`Before:\n${JSON.stringify(rawUpdatedApproval)}.\nAfter:\n${JSON.stringify(updatedApproval)}`);
                            error.error = "APPROVAL_DATA_VALIDATION";
                            error.fetchedApproval = fetchedApproval;
                            throw error;
                        }
                    }
                }

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
            else if (rawApproval === null) approvalList = []; // in case of not exists approval. approval should be removed.
            approvalList ? error.approvalSyncResult = Syncher.sync([currentApproval], approvalList) : error.approvalSyncResult = [];
            throw error;
        }
    }

    async init(context){
        this.config = context.config.controllerConfig;

        // for backward compatibility
        if (this.config.schemaTransformer) {
            this.BL.dataTransformer = ((approval) => jslt.transform(approval, this.config.schemaTransformer));
        }
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
        var UITemplates = {};

        return new Promise((resolve, reject) => {
            var processChunk = async (approvalsChunk, hasMore) => {
                var rawApprovals = approvalsChunk.approvals || approvalsChunk;

                var transformedApprovals = rawApprovals.map(approval => this._addApprovalData(approval, logger));
                var sendApprovals = syncher.syncChunk(transformedApprovals);

                for(var i = 0 ; i < sendApprovals.length ; i++) {

                    var sendApproval = sendApprovals[i];

                    if(!sendApproval.deleted) {
                        if(!UITemplates[sendApproval.schemaId] && UITemplates[sendApproval.schemaId] !== null)
                            UITemplates[sendApproval.schemaId] = await action.getUITemplate(sendApproval.schemaId);

                        if(UITemplates[sendApproval.schemaId]) {
                            var validationErr = this._validateApprovalData(sendApproval, UITemplates[sendApproval.schemaId], logger);
                            if(validationErr) {
                                let index = transformedApprovals.findIndex(a => a.private.id === sendApproval.private.id);
                                logger.error(`Approval data validation failed.`);
                                logger.debug(`Raw approval:\n${JSON.stringify(rawApprovals[index])}.\nTransformed approval:\n${JSON.stringify(sendApproval)}`)
                            }
                        }
                    }
                }

                if (!hasMore) {
                    if (!approvalsChunk.partialSync) sendApprovals = sendApprovals.concat(syncher.calcRemoved());
                    logger.info(syncher.stats, "Sync statistics");
                    syncher.destroy();
                }

                // sendApprovals = sendApprovals.filter(a => !a.error);
                logger.info(`Syncing chunk. length=${sendApprovals.length} isLast=${!hasMore}`);
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

            var fetchRes = this.BL.fetch({ signatureList, logger : blLogger, fetchType : action.syncType }, (err, approvalsChunk, hasMore) => {
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
        var logger = options.logger.child({component: "connector-controller"});

        if(!this.BL[data.action]) {
            var error =  new Error(`${data.action} was not implemented in the BL`);
            error.error = `TASK_INVALID`;
            throw error;
        }

        return this._performAction(data.action, data, options);
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
        logger.info(`Mapping users: ${JSON.stringify(data.ids)}`);
        try {
            var res = await this.BL.mapUserIds(data, {logger : blLogger});
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