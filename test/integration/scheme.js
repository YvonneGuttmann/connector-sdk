var expect = require('chai').expect;
var validate = require('capriza-schema').validate;
var getFullSchema = require('capriza-schema').getFullSchema;
const oracleExp = require('../../../business-logic/oracle-expense-approvals/index');
const coupaExp = require('../../../business-logic/coupa-expense-approvals/index');
const coupaPO = require('../../../business-logic/coupa-po-approvals/index');

describe("Capriza Schema", function() {
    describe("ORACLE-EBS - Expense Approval", function() {
        var app;
        this.timeout(60000);

        it("fetch function", function(done) {
            oracleExp.fetch().then(result => {
                const approval = result[0];
                app = approval;
                var res = validate(approval, "/ExpenseApproval");
                expect(res.errors.length).to.equal(0);
            }).then(() => done(), done) ;
        });

        it("getApproval function", function(done) {
            oracleExp.getApproval(app).then(approval => {
                var res = validate(approval, "/ExpenseApproval");
                expect(res.errors.length).to.equal(0);
            }).then(() => done(), done);
        });

    });

    describe("Coupa - Expense Approval", function() {
        var app;
        this.timeout(600000);

        it("fetch function", function(done) {
            coupaExp.fetch().then(result => {
                const approval = result[0];
                app = approval;
                var res = validate(approval, "https://www.capriza.com/schema/coupa/expense/1");
                expect(res.errors.length).to.equal(0);
            }).then(() => done(), done) ;
        });

        it("getApproval function", function(done) {
            coupaExp.getApproval(app).then(approval => {
                var res = validate(approval, "https://www.capriza.com/schema/coupa/expense/1");
                expect(res.errors.length).to.equal(0);
            }).then(() => done(), done);
        });

    });

    describe("Coupa - PO Approval", function() {
        var app;
        this.timeout(600000);

        it("fetch function", function(done) {
            coupaPO.fetch().then(result => {
                const approval = result[0];
                app = approval;
                var res = validate(approval, "https://www.capriza.com/schema/coupa/po/1");
                expect(res.errors.length).to.equal(0);
            }).then(() => done(), done) ;
        });

        it("getApproval function", function(done) {
            coupaPO.getApproval(app).then(approval => {
                var res = validate(approval, "https://www.capriza.com/schema/coupa/po/1");
                expect(res.errors.length).to.equal(0);
            }).then(() => done(), done);
        });

    });

});