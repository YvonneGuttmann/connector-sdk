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

describe ("approve / reject", function (){
    beforeEach (function (){
        var newApproval = {private: {id: "approval1", approver: "approver1"}};
        connector = {
            config: {},
            BL : {
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
            _addApprovalData(){
                return Connector.prototype._addApprovalData.apply (this, arguments);
            },
            _createApprovalFingerprints(){
                return Connector.prototype._createApprovalFingerprints.apply (this, arguments);
            },
            _compareActionFingerPrints(){
                return Connector.prototype._compareActionFingerPrints.apply (this, arguments);
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

        connector.approve({approval: {id: "caprizaId1", private: {id: "approval1"}, metaData: {fingerprints: {}}}}, {logger})
            .then(() => done("approve should have failed due to fingerprint mismatch"))
            .catch (err => {
                err.should.have.property ('details', "Approve failed for approval 'approval1'. approval doesn't match latest backend approval");
                err.approvalSyncResult[0].should.be.an('object');
                err.approvalSyncResult[0].should.have.property ('id',"caprizaId1");
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
            theConfig.actionFingerprint = {
                "actionFingerprint":{
                    "id": "{{approval.id}}",
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