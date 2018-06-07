var chai = require('chai');
var expect = chai.expect;
var mock = require('mock-require');
chai.should();
chai.use( require ("chai-as-promised") );

var theConfig = {};
mock('../lib/config', { getConfig() { return theConfig }});
var Connector = require ("../lib/connector").Connector;
var connector;

var Logger = require ("../lib/log").Logger;
var loggerFactory = new Logger(process.env.logStream);
var logger = loggerFactory.create({}).child({component: "index.js", module: "connectors", connectorName: "MOCK", connectorVersion: ""});

var approval = { schemaId: "schemaId", private: {id: "approval1", approver: "approver1"}, id: "caprizaId1" };
const MOCK_BL = {
    settings: {},
    resetApproval: () => { approval =  { schemaId: "schemaId", private: {id: "approval1", approver: "approver1"}, id: "caprizaId1" }},

    fetch(){
        return Promise.resolve([]);
    },
    getApproval(){
        return approval;
    },
    approve (){
        approval = null;
        return true;
    },
    reject () {
        return true;
    },
    downloadAttachment() {

    }
};


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

var MOCK_APPROVAL_1 = { schemaId: "schemaId", private: {id: "approval1", approver: "approver1"}, public: {name: "1"} };
var MOCK_APPROVAL_1_UPDATED = { schemaId: "schemaId", private: {id: "approval1", approver: "approver1"}, public: {name: "11"} };
var MOCK_APPROVAL_2 = { schemaId: "schemaId", private: {id: "approval2", approver: "approver2"}, public: {name: "2"} };
var MOCK_APPROVAL_3 = { schemaId: "schemaId", private: {id: "approval3", approver: "approver3"}, public: {name: "3"} };

describe ("SDK Tasks", function (){
    beforeEach (function (){
        Connector.init({config: { controllerConfig: {} }, logger: logger, BL: MOCK_BL});
        connector = new Connector({logger: logger});

        MOCK_APPROVAL_1 = { schemaId: "schemaId", private: {id: "approval1", approver: "approver1"}, public: {name: "1"} };
        MOCK_APPROVAL_1_UPDATED = { schemaId: "schemaId", private: {id: "approval1", approver: "approver1"}, public: {name: "11"} };
        MOCK_APPROVAL_2 = { schemaId: "schemaId", private: {id: "approval2", approver: "approver2"}, public: {name: "2"} };
        MOCK_APPROVAL_3 = { schemaId: "schemaId", private: {id: "approval3", approver: "approver3"}, public: {name: "3"} };
    });

    it ("~1 sync task - should add 1 approvals", function (done) {
        connector.BL.fetch = () => { return Promise.resolve([MOCK_APPROVAL_1]) };
        connector.setSignatureList([]);

        let action = {
            logger: logger,
            getUITemplate: function () {
                return {};
            },
            send: function (data) {
                data.approvals[0].should.deep.include({private: {approver: "approver1", id: "approval1"}});
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~2 sync task - fetch return same approval as store in the backend - should add 0 approvals", function (done) {
        connector.BL.fetch = () => { return Promise.resolve([MOCK_APPROVAL_1]) };
        connector.setSignatureList([connector._addApprovalData(MOCK_APPROVAL_1)]);

        let action = {
            logger: logger,
            getUITemplate: () => { return {} },
            send: function (data) {
                expect(data.approvals.length).to.equal(0);
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~3 sync task - fetch return new approval - should add 1 approval and remove 1 approval", function (done) {
        connector.BL.fetch = () => { return Promise.resolve([MOCK_APPROVAL_1]) };
        connector.setSignatureList([Object.assign(connector._addApprovalData(MOCK_APPROVAL_2), {id: "caprizaId1"})]);

        let action = {
            logger: logger,
            getUITemplate: () => { return {} },
            send: function (data) {
                data.approvals[0].should.deep.include({private: {approver: "approver1", id: "approval1"}});
                data.approvals[1].should.deep.include({id: "caprizaId1", deleted: true});
            }
        };

        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~4 sync task - fetch return empty list - should remove 1 approval", function (done) {
        connector.BL.fetch = () => { return Promise.resolve([]) };
        connector.setSignatureList([Object.assign(connector._addApprovalData(MOCK_APPROVAL_1), {id: "caprizaId1"})]);


        let action = {
            logger: logger,
            getUITemplate: () => { return {} },
            send: function (data) {
                data.approvals[0].should.deep.include({id: "caprizaId1", deleted: true});
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~5 sync task - fetch return empty list - should remove 0 approval instead of 1 due to partial sync", function (done) {
        connector.BL.fetch = () => { return Promise.resolve({approvals: [], partialSync: true}) };
        connector.setSignatureList([Object.assign(connector._addApprovalData(MOCK_APPROVAL_1), {id: "caprizaId1"})])

        let action = {
            logger: logger,
            getUITemplate: () => { return {} },
            send: function (data) {
                expect(data.approvals.length).to.equal(0);
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~6 sync task - fetch return updated approval - should update 1 approval", function (done) {
        connector.BL.fetch = () => { return Promise.resolve([MOCK_APPROVAL_1_UPDATED]) };
        connector.setSignatureList([connector._addApprovalData(MOCK_APPROVAL_1)])

        let action = {
            logger: logger,
            getUITemplate: () => { return {} },
            send: function (data) {
                data.approvals[0].should.deep.include(MOCK_APPROVAL_1_UPDATED);
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~7 sync task - fetch return new and updated approval - should update 1, add 1, remove 0 due to partial sync", function (done) {
        connector.BL.fetch = () => { return Promise.resolve({ approvals: [MOCK_APPROVAL_1_UPDATED, MOCK_APPROVAL_3], partialSync: true })};
        connector.setSignatureList([connector._addApprovalData(MOCK_APPROVAL_1), connector._addApprovalData(MOCK_APPROVAL_2)]);


        let action = {
            logger: logger,
            getUITemplate: () => { return {} },
            send: function (data) {
                data.approvals[0].should.deep.include(MOCK_APPROVAL_1_UPDATED);
                data.approvals[1].should.deep.include(MOCK_APPROVAL_3);
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~8 sync task - fetch return new approval but data transformer failed - should send 0 approval", function (done) {
        var transformer = () => {
            let approval = {};
            approval.kuku = a.ku.ku;
            return approval;
        };
        Connector.init({config: { controllerConfig: {} }, transformer, logger: console, BL: MOCK_BL});
        connector = new Connector({logger: logger});

        connector.BL.fetch = () => { return Promise.resolve([MOCK_APPROVAL_1])};
        connector.setSignatureList([]);

        let action = {
            logger: logger,
            getUITemplate: () => { return {} },
            send: function (data) {
                expect(data.approvals.length).to.equal(0);
            }
        };
        connector.sync(action).then(() => {
            done();
        });

    });

    it ("~9 sync task - fetch return new approval and UITemplate validate passed - should send 1 approval", function (done) {
        connector.BL.fetch = () => { return Promise.resolve([MOCK_APPROVAL_1])};
        connector.setSignatureList([]);

        let action = {
            logger: logger,
            getUITemplate: () => { return {
                name: "{{name:string}}"
            } },
            send: function (data) {
                data.approvals[0].should.deep.include(MOCK_APPROVAL_1);
            }
        };
        connector.sync(action).then(() => {
            done();
        });

    });

    it ("~10 sync task - fetch return new approval but UITemplate validate failed - should send 1 approval anyway", function (done) {
        connector.BL.fetch = () => { return Promise.resolve([MOCK_APPROVAL_1])};
        connector.setSignatureList([]);

        let action = {
            logger: logger,
            getUITemplate: () => { return {
                name: "{{kuku:string}}"
            } },
            send: function (data) {
                data.approvals[0].should.deep.include(MOCK_APPROVAL_1);
            }
        };
        connector.sync(action).then(() => {
            done();
        });

    });

    it ("~11 sync task - using callback - should add one approval, one chunk", function (done) {
        connector.BL.fetch = ({}, callback) => { return callback(null, [MOCK_APPROVAL_1], false); };
        connector.setSignatureList([]);

        let action = {
            logger: logger,
            getUITemplate: () => { return {} },
            send: function (data) {
                data.approvals[0].should.deep.include(MOCK_APPROVAL_1);
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~12 sync task - using callback - should add two approvals, two chunk", function (done) {
        connector.BL.fetch = ({}, callback) => { callback(null, [MOCK_APPROVAL_1], false); callback(null, [MOCK_APPROVAL_2], true); };
        connector.setSignatureList([]);

        let times = 0;
        let action = {
            logger: logger,
            getUITemplate: () => { return {} },
            send: function (data) {
                if(times==0) {
                    data.approvals[0].should.deep.include(MOCK_APPROVAL_1);
                    times++;
                } else {
                    data.approvals[0].should.deep.include(MOCK_APPROVAL_2);
                }
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~13 sync task - using callback - should add one approval, and NOT remove one because of partialSync", function (done) {
        connector.BL.fetch = ({}, callback) => { return callback(null, {approvals: [MOCK_APPROVAL_2], partialSync: true }, false); };
        connector.setSignatureList([connector._addApprovalData(MOCK_APPROVAL_1)]);

        let action = {
            logger: logger,
            getUITemplate: () => { return {} },
            send: function (data) {
                data.approvals[0].should.deep.include(MOCK_APPROVAL_2);
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~14 sync task - using callback - should add 1 approval, and remove 1", function (done) {
        connector.BL.fetch = ({}, callback) => { return callback(null, {approvals: [MOCK_APPROVAL_2], partialSync: false }, false); };
        connector.setSignatureList([Object.assign(connector._addApprovalData(MOCK_APPROVAL_1), {id: "caprizaId1"})]);


        let action = {
            logger: logger,
            getUITemplate: () => { return {} },
            send: function (data) {
                data.approvals[0].should.deep.include(MOCK_APPROVAL_2);
                data.approvals[1].should.deep.include({id: "caprizaId1", deleted: true});
            }
        };
        connector.sync(action).then(() => {
            done();
        });
    });

    it ("~15 sync task - using callback - throw error", function (done) {
        connector.BL.fetch = function ({}, callback) {
            callback("simulated error", [], false);
        };
        connector.setSignatureList([]);

        let action = {
            logger: logger,
        };
        connector.sync(action).then(res => {

        }).catch(err => {
            expect(err).to.equal("simulated error");
            done();
        });
    });

    it ("~16 approve task - should fail on bad validation - approval doesn't match latest backend approval", function (done){
        connector.setSignatureList([Object.assign(connector._addApprovalData(MOCK_APPROVAL_1), {id: "caprizaId1"})])
        var copiedApproval = JSON.parse(JSON.stringify(MOCK_APPROVAL_1));

        connector.approve({ approval: Object.assign(copiedApproval, {metadata: {fingerprints: {}}}) })
            .then(() =>
                done("approve should have failed due to fingerprint mismatch"))
            .catch (err => {
                err.should.have.property ('details', "Action failed! approval doesn't match latest backend approval");
                done();
            });
    });

    it ("~17 approve task - should fail on bad validation - approval doesn't match in the source system", function (done){
        connector.setSignatureList([Object.assign(connector._addApprovalData(MOCK_APPROVAL_1), {id: "caprizaId1"})]);

        connector.approve({ approval: MOCK_APPROVAL_1 })
            .then(() =>
                logger.error("approve should have failed due to fingerprint mismatch"))
            .catch (err => {
                err.should.have.property ('details', "Action failed! approval doesn't match in the source system");
                done();
            });
    });

    it ("~18 approve task - should return the approval as deleted once approved", function (done) {
        MOCK_BL.resetApproval();
        var approvalToApprove = { schemaId: "schemaId", private: {id: "approval1", approver: "approver1"}, id: "caprizaId1"};
        connector.setSignatureList([connector._addApprovalData(approvalToApprove)]);

        connector.approve({ approval: approvalToApprove}, {logger})
            .then (res => {
                res.approvals[0].should.deep.include ({id: "caprizaId1", syncver:undefined, deleted: true});
                done();
            });
    });

    it ("~19 approve task - should remove not exists approval from the backend (after approve)", function (done){
        connector.BL.getApproval = () => { return null };
        let approval = connector._addApprovalData(Object.assign(MOCK_APPROVAL_1, {id: "caprizaId"}));
        connector.setSignatureList([approval]);

        connector.approve({approval: approval}, {logger})
            .then(() =>
                logger.error("approve should have failed due to not exits approval"))
            .catch (err => {
                err.approvalSyncResult[0].should.deep.include ({id: "caprizaId",syncver:undefined, deleted: true});
                done();
            });
    });

    // it ("~20 approve task - disableMiniSync=true. approve action should auto remove approval without mini sync", function (done){
    //     MOCK_BL.resetApproval();
    //     MOCK_BL.settings.disableMiniSync = true;
    //     Connector.init({config: { controllerConfig: {} }, logger: logger, BL: MOCK_BL});
    //     connector = new Connector({logger: logger});
    //
    //     let a = connector._addApprovalData(Object.assign(approval, {id: "caprizaId"}));
    //     connector.setSignatureList([a]);
    //     connector.approve({approval: a}, {logger})
    //         .then(data => {
    //             data.approvals[0].should.deep.include ({id: "caprizaId",syncver:undefined, deleted: true});
    //             done();
    //         });
    // });

    // it ("~21 approve task - approve and miniSync should return the approval again (chain)", function (done){
    //
    //     // getApproval return same approval before and after the action. hence miniSync should return 0 approvals
    //     connector.BL.approve = () => { approval.private.approver = 20; return true; };
    //     let approval = connector._addApprovalData(Object.assign(MOCK_APPROVAL_1, {id: "caprizaId"}));
    //     connector.BL.settings = {disableMiniSync: false};
    //
    //     connector.setSignatureList([approval]);
    //     connector.approve({approval: approval}, {logger})
    //         .then(approvals => {
    //             expect(approvals.length).to.equal(0);
    //             done();
    //         });
    // });

    // it ("~22 reject task - disableMiniSync=true. reject action should auto remove approval without mini sync", function (done){
    //
    //     MOCK_BL.resetApproval();
    //     MOCK_BL.settings.disableMiniSync = true;
    //     Connector.init({config: { controllerConfig: {} }, logger: logger, BL: MOCK_BL});
    //     connector = new Connector({logger: logger});
    //
    //     let a = connector._addApprovalData(Object.assign(approval, {id: "caprizaId"}));
    //     connector.setSignatureList([a]);
    //     connector.reject({approval: a}, {logger})
    //         .then(data => {
    //             data.approvals[0].should.deep.include ({id: "caprizaId",syncver:undefined, deleted: true});
    //             done();
    //         });
    //
    // });
});

describe ("BL Validation", function (){
    var requiredMethods = ['init', 'stop', 'fetch', 'approve', 'reject', 'downloadAttachment'];
    var allCombinations = powerset(requiredMethods);

    it ("~1 should fail BL validation if one of the required methods is missing (without getApprovals)", function (done){
        allCombinations.forEach (blCombo => {
            var bl = blCombo.reduce ( (bl, method) => Object.assign(bl, {[method]: () => null}), {});
            var mockConnector = {
                logger: console,
                BL: bl
            }
            Connector.init({config: { controllerConfig: {} }, logger: logger, BL: mockConnector});
            var comboShouldFail = blCombo.join(",") !== requiredMethods.join(",");

            if (comboShouldFail)
                expect (() => Connector.validateBL()).to.throw();
        });
        done();
    });

    // it ("~2 should fail if getApproval method is missing without selfValidation=false, disableMiniSync=false in the bl settings", function (done){
    //     var mockConnector = {
    //         logger: console,
    //         BL: Object.assign ({settings: {}}, requiredMethods.reduce ( (bl, method) => Object.assign (bl, {[method]: () => null}), {} ))
    //     }
    //     Connector.init({config: { controllerConfig: {} }, logger: logger, BL: mockConnector});
    //
    //     expect (() => Connector.validateBL()).to.throw(/'getApproval' method is missing in the BL Connector/);
    //     done();
    // });
    //
    // it ("~3 should fail if getApproval method is missing with selfValidation=true, disableMiniSync=false in the bl settings", function (done){
    //     var mockConnector = {
    //         logger: console,
    //         BL: Object.assign (
    //             {settings: {selfValidation: true}},
    //             requiredMethods.reduce ( (bl, method) => Object.assign (bl, {[method]: () => null}), {} )
    //         )
    //     }
    //     Connector.init({config: { controllerConfig: {} }, logger: logger, BL: mockConnector});
    //
    //
    //     expect (() => Connector.validateBL()).to.throw(/'getApproval' method is missing in the BL Connector/);
    //     done();
    // });
    //
    // it ("~4 should fail if getApproval method is missing with selfValidation=false, disableMiniSync=true in the bl settings", function (done){
    //     var mockConnector = {
    //         logger: console,
    //         BL: Object.assign (
    //             {settings: {disableMiniSync: true}},
    //             requiredMethods.reduce ( (bl, method) => Object.assign (bl, {[method]: () => null}), {} )
    //         )
    //     }
    //     Connector.init({config: { controllerConfig: {} }, logger: logger, BL: mockConnector});
    //     expect (() => Connector.validateBL()).to.throw(/'getApproval' method is missing in the BL Connector/);
    //     done();
    // });
    //
    // it ("~5 should pass if getApproval method is missing with disableMiniSync=true && selfValidation = true in the bl settings", function (done){
    //     var mockConnector = {
    //         logger: console,
    //         BL: Object.assign (
    //             {settings: {disableMiniSync: true, selfValidation: true}},
    //             requiredMethods.reduce ( (bl, method) => Object.assign (bl, {[method]: () => null}), {} )
    //         )
    //     }
    //     Connector.init({config: { controllerConfig: {} }, logger: logger, BL: mockConnector});
    //     expect (() => Connector.validateBL()).to.not.throw(/'getApproval' method is missing in the BL Connector/);
    //     done();
    // });

});