var chai = require('chai');
var expect = chai.expect;
var mock = require('mock-require');
chai.should();
chai.use( require ("chai-as-promised") );
var theConfig = {};
mock('../lib/config', { getConfig() { return theConfig }});
var connector;
var MOCK_APPROVAL_1;

describe ("Controller functions", function () {
    beforeEach (function (){
        connector = require('./mockSDK');
        connector.BL.dataTransformer = (a) => { return a; };
        MOCK_APPROVAL_1 = { schemaId: "schemaId", private: {id: "approval1", approver: "approver1"}, public: {name: "1"} };
    });

    it("~1 - _addApprovalData function - should add metadata with fingerprints, systemApprovalId and systemUserId", function (done) {
        var approval = connector._addApprovalData(MOCK_APPROVAL_1);
        var expectObj = {
            private: { approver: "approver1", id: "approval1" },
            public: {name: "1"},
            metadata: { fingerprints: { sync: "ad13439f104f0fa02e29d80a3eb7aa0f27808fe1" } },
            schemaId: "schemaId",
            systemApprovalId: "approval1",
            systemUserId: "approver1"
        };
        approval.should.deep.include(expectObj);
        done();
    });

    it("~2 - _addApprovalData function - should return approval with error when there is no schemaId in the approval", function (done) {
        delete MOCK_APPROVAL_1.schemaId;
        var approval = connector._addApprovalData(MOCK_APPROVAL_1, console);
        MOCK_APPROVAL_1.error = "TransformException";
        approval.should.deep.include(MOCK_APPROVAL_1);
        done();
    });

    it("~3 - _createApprovalFingerprints function - without action", function (done) {
        var fingerprints = connector._createApprovalFingerprints(MOCK_APPROVAL_1);
        var expectObj = {
            sync: "ad13439f104f0fa02e29d80a3eb7aa0f27808fe1"
        };
        fingerprints.should.deep.include(expectObj);
        done();
    });

    it("~4 - _createApprovalFingerprints function - with action", function (done) {
        connector.config = {
            "actionFingerprint": {
                "id": "{{approval.id}}"
            }
        };

        var fingerprints = connector._createApprovalFingerprints(MOCK_APPROVAL_1);
        var expectObj = {
            sync: "ad13439f104f0fa02e29d80a3eb7aa0f27808fe1",
            action: "f05094bf40c779b4a60fb63dcd9a8d0b67710e15"
        };
        fingerprints.should.deep.include(expectObj);
        done();
    });

    it("~5 - _createApprovalFingerprints function - changed approval property - only sync should be changed", function (done) {
        connector.config = {
            "actionFingerprint": {
                "id": "{{private.id}}"
            }
        };

        var fingerprints = connector._createApprovalFingerprints(MOCK_APPROVAL_1);
        var expectObj = {
            sync: "ad13439f104f0fa02e29d80a3eb7aa0f27808fe1",
            action: "d8ab3a8ebdf4d0e61cfdd8e9b08c622011dafeb8"
        };
        fingerprints.should.deep.include(expectObj);

        let copiedApproval = JSON.parse(JSON.stringify(MOCK_APPROVAL_1));
        copiedApproval.public.name = "name";

        fingerprints = connector._createApprovalFingerprints(copiedApproval);
        expectObj.sync = "c6439cb0bcf68515b9065e410058812c0c879aba";
        fingerprints.should.deep.include(expectObj);
        done();
    });

    it("~6 - _createApprovalFingerprints function - changed approval property - sync and action should be changed", function (done) {
        connector.config = {
            "actionFingerprint": {
                "id": "{{private.id}}"
            }
        };

        var fingerprints = connector._createApprovalFingerprints(MOCK_APPROVAL_1);
        var expectObj = {
            sync: "ad13439f104f0fa02e29d80a3eb7aa0f27808fe1",
            action: "d8ab3a8ebdf4d0e61cfdd8e9b08c622011dafeb8"
        };
        fingerprints.should.deep.include(expectObj);

        let copiedApproval = JSON.parse(JSON.stringify(MOCK_APPROVAL_1));
        copiedApproval.private.id = "approval2";
        fingerprints = connector._createApprovalFingerprints(copiedApproval);

        expectObj = {
            sync: "9e00850e0a27939668e49a3509aa9f88e136a0ad",
            action: "695d65bf4b7c01bb9d459234a6f20d7f8e1a2dc7"
        };
        fingerprints.should.deep.include(expectObj);
        done();
    });

    it("~7 _compareActionFingerPrints - should check sync hash and return true", function (done) {
        connector.config = {};

        let app1 = {
            metadata: {
                fingerprints: {
                    sync: "1"
                }
            }
        };
        expect(connector._compareActionFingerPrints(app1, app1)).to.equal(true);
        done();
    });

    it("~8 _compareActionFingerPrints - should check sync hash and return false", function (done) {
        connector.config = {};

        let app1 = {
            metadata: {
                fingerprints: {
                    sync: "1"
                }
            }
        };

        let app2 = {
            metadata: {
                fingerprints: {
                    sync: "2"
                }
            }
        };

        expect(connector._compareActionFingerPrints(app1, app2)).to.equal(false);
        done();
    });

    it("~9 _compareActionFingerPrints - should check action hash and return true", function (done) {
        connector.config = {
            "actionFingerprint": {
                "id": "{{private.id}}"
            }
        };

        let app1 = {
            metadata: {
                fingerprints: {
                    action: "a",
                    sync: "1"
                }
            }
        };
        expect(connector._compareActionFingerPrints(app1, app1)).to.equal(true);
        done();
    });

    it("~10 _compareActionFingerPrints - should check action hash and return false", function (done) {
        let app1 = {
            metadata: {
                fingerprints: {
                    action: "a",
                    sync: "1"
                }
            }
        };

        let app2 = JSON.parse(JSON.stringify(app1));
        app2.metadata.fingerprints.action = "b";

        expect(connector._compareActionFingerPrints(app1, app2)).to.equal(false);
        done();
    });

    it("~11 _validateApprovalData - validate succeeded - should return null", function (done) {
        let input = {
            public: {
                number: 1,
                string: "hello",
                date: new Date()
            }
        };

        let template = {
            number: "{{number:number}}",
            string: "{{string:string}}",
            date: "{{date:date}}"
        };

        let err = connector._validateApprovalData(input, template, console);
        expect(err).to.equal(null);
        done();
    });

    it("~12 _validateApprovalData - validate failed - should return error", function (done) {
        let input = {
            public: {
                number: 1,
                string: "hello",
                date: new Date()
            }
        };

        let template = {
            number: "{{number:number}}",
            string: "{{string:date}}",
            date: "{{date:date}}"
        };

        let err = connector._validateApprovalData(input, template, console);
        expect(err).to.not.equal(null);
        done();
    })

});