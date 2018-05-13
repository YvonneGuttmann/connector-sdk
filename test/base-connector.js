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
describe ("SDK Tasks", function (){
    beforeEach (function (){
        var newApproval = {private: {id: "approval1", approver: "approver1"}};
        connector = {
            config: {},
            BL : {
                settings: {},
                fetch(){
                    return Promise.resolve([newApproval]);
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
        }
    })

    it ("~1 sync task - should add 1 approvals", function (done) {
        connector.signatureList = [];
        let action = {
            logger: logger,
            send: function (approvals) {
                approvals[0].should.deep.include({private: {approver: "approver1", id: "approval1"}});
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~2 sync task - fetch return same approval as store in the backend - should add 0 approvals", function (done) {
        var backendApproval = {private: {id: "approval1", approver: "approver1"}};
        connector._addApprovalData(backendApproval);
        connector.signatureList = [backendApproval];

        let action = {
            logger: logger,
            send: function (approvals) {
                expect(approvals.length).to.equal(0);
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~3 sync task - fetch return new approval - should add 1 approval and remove 1 approval", function (done) {
        var backendApproval = {private: {id: "approval2", approver: "approver2"}};
        connector._addApprovalData(backendApproval);
        backendApproval.id = "caprizaId1";
        connector.signatureList = [backendApproval];

        let action = {
            logger: logger,
            send: function (approvals) {
                approvals[0].should.deep.include({private: {approver: "approver1", id: "approval1"}});
                approvals[1].should.deep.include({id: "caprizaId1", deleted: true});
            }
        };

        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~4 sync task - fetch return empty list - should remove 1 approval", function (done) {
        var backendApproval = {private: {id: "approval1", approver: "approver1"}};
        connector._addApprovalData(backendApproval);
        backendApproval.id = "caprizaId1";
        connector.signatureList = [backendApproval];
        connector.BL.fetch = function () {
            return Promise.resolve([])
        };

        let action = {
            logger: logger,
            send: function (approvals) {
                approvals[0].should.deep.include({id: "caprizaId1", deleted: true});
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~5 sync task - fetch return empty list - should remove 0 approval instead of 1 due to partial sync", function (done) {
        var backendApproval = {private: {id: "approval1", approver: "approver1"}};
        connector._addApprovalData(backendApproval);
        connector.signatureList = [backendApproval];
        connector.BL.fetch = function () {
            return Promise.resolve({approvals: [], partialSync: true});
        };

        let action = {
            logger: logger,
            send: function (approvals) {
                expect(approvals.length).to.equal(0);
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~6 sync task - fetch return updated approval - should update 1 approval", function (done) {
        var backendApproval = {private: {id: "approval1", approver: "approver1"}, a: "1"};
        connector._addApprovalData(backendApproval);
        connector.signatureList = [backendApproval];

        let action = {
            logger: logger,
            send: function (approvals) {
                approvals[0].should.deep.include({private: {approver: "approver1", id: "approval1"}, a: "1"});
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~7 sync task - fetch return new and updated approval - should update 1, add 1, remove 0 due to partial sync", function (done) {
        var backendApproval = {private: {id: "approval1", approver: "approver1"}, a: "1"};
        var backendApproval2 = {private: {id: "approval2", approver: "approver2"}, a: "2"};
        connector._addApprovalData(backendApproval);
        connector._addApprovalData(backendApproval2);
        connector.signatureList = [backendApproval, backendApproval2];

        connector.BL.fetch = function () {
            var updatedApproval = {private: {id: "approval1", approver: "approver1"}, a: "a"};
            var newApproval = {private: {id: "approval3", approver: "approver3"}, a: "3"};
            return Promise.resolve({approvals: [updatedApproval, newApproval], partialSync: true})
        };

        let action = {
            logger: logger,
            send: function (approvals) {
                approvals[0].should.deep.include({private: {approver: "approver1", id: "approval1"}, a: "a"});
                approvals[1].should.deep.include({private: {approver: "approver3", id: "approval3"}, a: "3"});
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~8 sync task - using callback - should add one approval, one chunk", function (done) {
        connector.signatureList = [];
        connector.BL.fetch = function ({}, callback) {
            var newApproval = {private: {id: "approval1", approver: "approver1"}};
            callback(null, [newApproval], false);
        };

        let action = {
            logger: logger,
            send: function (approvals) {
                approvals[0].should.deep.include({private: {approver: "approver1", id: "approval1"}});
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~9 sync task - using callback - should add two approvals, two chunk", function (done) {
        connector.signatureList = [];
        connector.BL.fetch = function ({}, callback) {
            var newApproval = {private: {id: "approval1", approver: "approver1"}};
            callback(null, [newApproval], false);
            var newApproval2 = {private: {id: "approval2", approver: "approver2"}};
            callback(null, [newApproval2], true);
        };

        let times = 0;
        let action = {
            logger: logger,
            send: function (approvals) {
                if(times==0) {
                    approvals[0].should.deep.include({private: {approver: "approver1", id: "approval1"}});
                    times++;
                } else {
                    approvals[0].should.deep.include({private: {approver: "approver2", id: "approval2"}});
                }
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~10 sync task - using callback - should add one approval, and NOT remove one because of partialSync", function (done) {
        var backendApproval = {private: {id: "approval1", approver: "approver1"}, a: "1"};
        connector._addApprovalData(backendApproval);
        connector.signatureList = [backendApproval];

        connector.BL.fetch = function ({}, callback) {
            var newApproval2 = {private: {id: "approval2", approver: "approver2"}};
            callback(null, {approvals: [newApproval2], partialSync: true}, false);
        };

        let action = {
            logger: logger,
            send: function (approvals) {
                approvals[0].should.deep.include({private: {approver: "approver2", id: "approval2"}});
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~11 sync task - using callback - should add 1 approval, and remove 1", function (done) {
        var backendApproval = {private: {id: "approval1", approver: "approver1"}, a: "1"};
        connector._addApprovalData(backendApproval);
        backendApproval.id = "caprizaId1";
        connector.signatureList = [backendApproval];

        connector.BL.fetch = function ({}, callback) {
            var newApproval2 = {private: {id: "approval2", approver: "approver2"}};
            callback(null, [newApproval2], false);
        };

        let action = {
            logger: logger,
            send: function (approvals) {
                approvals[0].should.deep.include({private: {approver: "approver2", id: "approval2"}});
                approvals[1].should.deep.include({id: "caprizaId1", deleted: true});
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~12 sync task - using callback - throw error", function (done) {
        connector.signatureList = [];
        connector.BL.fetch = function ({}, callback) {
            callback("simulated error", [], false);
        };

        let action = {
            logger: logger,
        };
        connector.sync(action).then(res => {

        }).catch(err => {
            expect(err).to.equal("simulated error");
            done();
        });
    });

    it ("~13 approve task - should fail on bad validation (the approval has changed)", function (done){
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

    it ("~14 approve task - should return the approval as deleted once approved (assuming not returned again by getApproval)", function (done) {
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

    it ("~15 approve task - should remove not exists approval from the backend (after approve)", function (done){
        var backendApproval = {private: {id: "approval1", approver: "approver1", a: "a"}, metadata: {fingerprints: {sync: "a"}}};
        connector._addApprovalData(backendApproval);
        backendApproval.id = "caprizaId1";
        connector.signatureList = [backendApproval];
        connector.BL.getApproval = function () {
            return null;
        };
        connector.approve({approval: backendApproval}, {logger})
            .then(() =>
                done("approve should have failed due to not exits approval"))
            .catch (err => {
                err.approvalSyncResult[0].should.deep.include ({id: "caprizaId1",syncver:undefined, deleted: true});
                done();
            });
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

    describe ("When actionFingerprint is not configured", function (){

        beforeEach (function (){
            connector.config = {};
        });


        it ("~5 return same hash", function (){
            var obj = {approval: {id: "caprizaId1", requester: "Roie Uziel", private: {id: "approval1"}}};
            var h1 = connector._createApprovalFingerprints(obj);

            expect(h1.sync).to.equal(connector._createApprovalFingerprints(obj).sync);
        });

        it ("~6 return different hash if object was changed", function (){
            var obj = {approval: {id: "caprizaId1", requester: "Roie Uziel", private: {id: "approval1"}}};
            var h1 = connector._createApprovalFingerprints(obj);
            obj.approval.requester = "John Doe";

            expect(h1.sync).not.to.equal(connector._createApprovalFingerprints(obj).sync);
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