var chai = require('chai');
var expect = chai.expect;
var mock = require('mock-require');
chai.should();
chai.use( require ("chai-as-promised") );

var Logger = require ("../lib/log").Logger;
var loggerFactory = new Logger("console");
var logger = loggerFactory.create({component: "test/connector-controller"});
var theConfig = {};
mock('../lib/config', { getConfig() { return theConfig }});
var Connector = require ("../lib/connector").Connector;
var connector;
var powerset = (array) => { // O(2^n)
    const results = [[]];
    for (const value of array) {
        const copy = [...results]; // See note below.
        for (const prefix of copy) {
            results.push(prefix.concat(value));
        }
    }
    return results;
};
describe ("approve / reject", function (){
    beforeEach (function (){
        var newApproval = {private: {id: "approval1", approver: "approver1"}};
        connector = {
            config: {},
            BL : {
                settings: {},
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
            async getApproval () {
                return Connector.prototype.getApproval.apply (this, arguments);
            },
            async approve (){
                return Connector.prototype.approve.apply (this, arguments);
            },
            async reject (){
                return Connector.prototype.reject.apply (this, arguments);
            }
        }
    })

    it ("~1 should fail on bad validation (the approval has changed)", function (done){

        var backendApproval = {private: {id: "approval1", approver: "approver1", a: "a"}};
        connector._addApprovalData(backendApproval);
        backendApproval.id = "caprizaId1";
        connector.signatureList = [backendApproval];

        connector.approve({approval: {id: "caprizaId1", private: {id: "approval1"}, metadata: {fingerprints: {}}}}, {logger})
            .then(() =>
                done("approve should have failed due to fingerprint mismatch"))
            .catch (err => {
                err.should.have.property ('details', "Action failed! approval doesn't match latest backend approval");
                done();
            });
    });

    it ("~2 should return the approval as deleted once approved (assuming not returned again by getApproval)", function (done) {
        var approval = {private: {id: "approval1", approver: "approver1"}};
        connector._addApprovalData(approval);
        approval.id = "caprizaId1";
        connector.signatureList = [approval];
        connector.approve({approval}, {logger})
            .then (res => {
                res.should.deep.include ({id: "caprizaId1",syncver:undefined, deleted: true});
                done();
            }).catch(done);
    });
});

describe ("Fingerprint Object", function (){
    it ("~1 return same hash if object is the same)", function (){
        var obj = {approval: {id: "caprizaId1", requester: "Roie Uziel", private: {id: "approval1"}}};
        var obj2 = {approval: {id: "caprizaId1", requester: "Roie Uziel", private: {id: "approval1"}}};

        expect(connector._createApprovalFingerprints(obj)).to.deep.equal(connector._createApprovalFingerprints(obj2));
    });

    it ("~2 return different hash if object changed)", function (){
        var obj = {approval: {id: "caprizaId1", requester: "Roie Uziel", private: {id: "approval1"}}};
        var h1 = connector._createApprovalFingerprints(obj);
        obj.approval.requester = "John Doe";

        expect(h1).not.to.equal(connector._createApprovalFingerprints(obj));
    });

    describe ("When actionFingerprint is configured", function (){

        beforeEach (function (){
            connector.config = {
                    "actionFingerprint": {
                        "id": "{{approval.id}}"
                    }
            };
        });


        it ("~3 return same hash if object changed but actionFingerprint returned same object)", function (){
            var obj = {approval: {id: "caprizaId1", requester: "Roie Uziel", private: {id: "approval1"}}};
            var h1 = connector._createApprovalFingerprints(obj);
            obj.approval.requester = "John Doe";

            expect(h1.action).to.equal(connector._createApprovalFingerprints(obj).action);
        });

        it ("~4 return different hash if object changed but actionFingerprint returned different object)", function (){
            var obj = {approval: {id: "caprizaId1", requester: "Roie Uziel", private: {id: "approval1"}}};
            var h1 = connector._createApprovalFingerprints(obj);
            obj.approval.id = "caprizaId2";

            expect(h1.action).not.to.equal(connector._createApprovalFingerprints(obj).action);
        });
    });

});

describe ("BL Validation", function (){
    var requiredMethods = ['init', 'stop', 'fetch', 'approve', 'reject', 'downloadAttachment'];
    var allCombinations = powerset(requiredMethods);

    it ("~1 should fail BL validation if one of the required methods is missing (without getApprovals)", function (){
        allCombinations.forEach (blCombo => {
            var bl = blCombo.reduce ( (bl, method) => Object.assign(bl, {[method]: () => null}), {});
            var mockConnector = {
                logger: console,
                BL: bl
            }
            var comboShouldFail = blCombo.join(",") !== requiredMethods.join(",");
            if (comboShouldFail)
                expect (() => Connector.prototype.validateBL.apply(mockConnector)).to.throw();
        });
    });

    it ("~2 should fail if getApproval method is missing without selfValidation=false, disableMiniSync=false in the bl settings", function (){
        var mockConnector = {
            logger: console,
            BL: Object.assign ({settings: {}}, requiredMethods.reduce ( (bl, method) => Object.assign (bl, {[method]: () => null}), {} ))
        }
        expect (() => Connector.prototype.validateBL.apply(mockConnector)).to.throw(/'getApproval' method is missing in the BL Connector/);

    });

    it ("~3 should fail if getApproval method is missing with selfValidation=true, disableMiniSync=false in the bl settings", function (){
        var mockConnector = {
            logger: console,
            BL: Object.assign (
                {settings: {selfValidation: true}},
                requiredMethods.reduce ( (bl, method) => Object.assign (bl, {[method]: () => null}), {} )
            )
        }
        expect (() => Connector.prototype.validateBL.apply(mockConnector)).to.throw(/'getApproval' method is missing in the BL Connector/);

    });

    it ("~4 should fail if getApproval method is missing with selfValidation=false, disableMiniSync=true in the bl settings", function (){
        var mockConnector = {
            logger: console,
            BL: Object.assign (
                {settings: {disableMiniSync: true}},
                requiredMethods.reduce ( (bl, method) => Object.assign (bl, {[method]: () => null}), {} )
            )
        }
        expect (() => Connector.prototype.validateBL.apply(mockConnector)).to.throw(/'getApproval' method is missing in the BL Connector/);

    });

    it ("~5 should pass if getApproval method is missing with disableMiniSync=true && selfValidation = true in the bl settings", function (){
        var mockConnector = {
            logger: console,
            BL: Object.assign (
                {settings: {disableMiniSync: true, selfValidation: true}},
                requiredMethods.reduce ( (bl, method) => Object.assign (bl, {[method]: () => null}), {} )
            )
        }
        expect (() => Connector.prototype.validateBL.apply(mockConnector)).to.not.throw(/'getApproval' method is missing in the BL Connector/);

    });

});