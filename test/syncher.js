var should = require('chai').should();
var syncher = require ("../lib/syncher.js");
var hash = require ("object-hash");
var Logger = require ("../lib/log").Logger;
var loggerFactory = new Logger("console");
var logger = loggerFactory.create({component: "test/syncher.js"});

describe ("syncher", function (){
    it ("~1 should return hashList as removed if no data fetched", function (){
        var result = syncher.sync ([{id: "1",syncver: "1", private: {id: "1"}, hash: "XXX"}], [], {logger});
        result.should.deep.include ({id: "1", syncver: "1", deleted: true});
    });

    it ("~2 check sync for added, removed, updated", function (){

        var mockApprovals = [
            {private: {id: "1"}, public: {attr1: "attr1", attr2: "attr2", attr3: [{id: "line1", line_attr1: "line_attr1"}, {id: "line2", line_attr1: "line_attr2"}]}},
            {private: {id: "2"}, public: {attr1: "attr1", attr2: "attr2", attr3: [{id: "line1", line_attr1: "line_attr1"}, {id: "line2", line_attr1: "line_attr2"}]}},
            {private: {id: "3"}, public: {attr1: "attr1", attr2: "attr2", attr3: [{id: "line1", line_attr1: "line_attr1"}, {id: "line2", line_attr1: "line_attr2"}]}},
            {private: {id: "4"}, public: {attr1: "attr1", attr2: "attr2", attr3: [{id: "line1", line_attr1: "line_attr1"}, {id: "line2", line_attr1: "line_attr2"}]}}
        ].map ((approval,index) => Object.assign(approval, {metadata: {fingerprints : {sync: hash (approval)}}}, {id: (index + 1) + ""}));

        var mockHashList = [
            {id: "2", private: {id: "2"}, metadata: mockApprovals[1].metadata},
            {id: "3", private: {id: "3"},metadata: mockApprovals[2].metadata},
            {id: "4", private: {id: "4"},metadata: mockApprovals[2].metadata},
            {id: "5", private: {id: "5"},metadata: mockApprovals[2].metadata}
        ]

        var expected = {
            added: [mockApprovals[0]],
            removed: [{id: "5", syncver: undefined, deleted: true}],
            updated: [mockApprovals[3]]
        }

        var result = syncher.sync (mockHashList, mockApprovals, {logger});
        result.should.have.deep.members (expected.added.concat(expected.removed).concat(expected.updated));
    });
});