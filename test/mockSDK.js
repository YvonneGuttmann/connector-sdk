var Connector = require ("../lib/connector").Connector;
var newApproval = { schemaId: "schemaId", private: {id: "approval1", approver: "approver1"}, id: "caprizaId1" };
module.exports = {

    // only for test
    resetApproval: () => { newApproval =  { schemaId: "schemaId", private: {id: "approval1", approver: "approver1"}, id: "caprizaId1" }},

    config: {},
    BL : {
        settings: {},
        fetch(){
            return Promise.resolve([]);
        },
        getApproval(){
            return newApproval;
        },
        approve (){
            newApproval = null; //removed after approved
            return true;
        },
        reject () {
            return true;
        }
    },
    getBLLogger() {
        return Connector.prototype.getBLLogger.apply (this, arguments);
    },
    _addApprovalData(){
        return Connector.prototype._addApprovalData.apply (this, arguments);
    },
    _createApprovalFingerprints(){
        return Connector.prototype._createApprovalFingerprints.apply (this, arguments);
    },
    _compareActionFingerPrints(){
        return Connector.prototype._compareActionFingerPrints.apply (this, arguments);
    },
    async _performAction() {
        return Connector.prototype._performAction.apply(this, arguments);
    },
    _validateApprovalData() {
        return Connector.prototype._validateApprovalData.apply(this, arguments);
    },
    async sync () {
        return Connector.prototype.sync.apply(this, arguments);
    },
    async getApproval () {
        return Connector.prototype.getApproval.apply (this, arguments);
    },
    async approve (){
        return Connector.prototype.approve.apply (this, arguments);
    },
    async reject (){
        return Connector.prototype.reject.apply (this, arguments);
    }
};
