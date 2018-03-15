var should = require('chai').should();
var syncher = require ("../lib/syncher.js");
var hash = require ("object-hash");
var Logger = require ("../lib/log").Logger;
var loggerFactory = new Logger("console");
var logger = loggerFactory.create({component: "test/syncher.js"});

describe ("syncher", function (){
    it("~1 should return hashList as removed if no data fetched", function (){
        var result = syncher.sync ([{id: "1",syncver: "1", private: {id: "1"}, hash: "XXX"}], [], {logger});
        result.should.deep.include ({id: "1", syncver: "1", deleted: true});
    });

    it("~2 check sync for added, removed, updated", function (){

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

    it("~3 added", function (){
		var mockHashList = [
			{ id: 1, private: { id: 1, approver : "approver" }, metadata: { fingerprints: { sync: "111", action: "aaa" } } },
        ];
		
        var mockApprovals = [
			{ private: { id: 1, approver : "approver" }, metadata: { fingerprints: { sync: "111", action: "aaa" } } },
			{ private: { id: 2, approver : "approver" }, metadata: { fingerprints: { sync: "222", action: "bbb" } } }
        ];

        var expected = [
			{ private: { id: 2, approver : "approver" }, metadata: { fingerprints: { sync: "222", action: "bbb" } } }
		];

        syncher.sync(mockHashList, mockApprovals).should.have.deep.members(expected);
    });
	
    it("~4 updated", function (){
		var mockHashList = [
			{ id: 1, private: { id: 1, approver : "approver" }, metadata: { fingerprints: { sync: "111", action: "aaa" } } },
        ];
		
        var mockApprovals = [
			{ private: { id: 1, approver : "approver" }, metadata: { fingerprints: { sync: "1111", action: "aaa" } } },
        ];

        var expected = [
			{ id: 1, private: { id: 1, approver : "approver" }, metadata: { fingerprints: { sync: "1111", action: "aaa" } } },
		];

        syncher.sync(mockHashList, mockApprovals).should.have.deep.members(expected);
    });
		
    it("~5 removed", function (){
		var mockHashList = [
			{ id: 1, private: { id: 1, approver : "approver" }, metadata: { fingerprints: { sync: "111", action: "aaa" } } },
			{ id: 2, private: { id: 2, approver : "approver" }, metadata: { fingerprints: { sync: "aaa", action: "bbb" } } },
        ];
		
        var mockApprovals = [
			{ private: { id: 1, approver : "approver" }, metadata: { fingerprints: { sync: "111", action: "aaa" } } },
        ];

        var expected = [
			{ id: 2, syncver: undefined, deleted: true }
		];

        syncher.sync(mockHashList, mockApprovals).should.have.deep.members(expected);
    });
	
    it("~6 approval.error", function (){
		var mockHashList = [
			{ id: 1, private: { id: 1, approver : "approver" }, metadata: { fingerprints: { sync: "111", action: "aaa" } } },
			{ id: 2, private: { id: 2, approver : "approver" }, metadata: { fingerprints: { sync: "222", action: "bbb" } } }
        ];
		
        var mockApprovals = [
			{ private: { id: 1 }, metadata : { fingerprints : {} }, error: "some error" },
			{ private: { id: 2, approver : "approver" }, metadata: { fingerprints: { sync: "222", action: "bbb" } } }
        ];

        var expected = [];

        syncher.sync(mockHashList, mockApprovals).should.have.deep.members(expected);
    });
	
    it("~7 approval.deleted", function (){
		var mockHashList = [
			{ id: 1, private: { id: 1, approver : "approver" }, metadata: { fingerprints: { sync: "111", action: "aaa" } } },
			{ id: 2, private: { id: 2, approver : "approver" }, metadata: { fingerprints: { sync: "222", action: "bbb" } } }
        ];
		
        var mockApprovals = [
			{ private: { id: 1 }, metadata : { fingerprints : {} }, deleted: true },
			{ private: { id: 2, approver : "approver" }, metadata: { fingerprints: { sync: "222", action: "bbb" } } }
        ];

        var expected = [
			{ id: 1, syncver: undefined, deleted: true }
		];

        syncher.sync(mockHashList, mockApprovals).should.have.deep.members(expected);
    });
	
    it("~8 approver change", function (){
		var mockHashList = [
			{ id: 1, private: { id: 1, approver : "approver" }, metadata: { fingerprints: { sync: "111", action: "aaa" } } },
			{ id: 2, private: { id: 2, approver : "approver" }, metadata: { fingerprints: { sync: "222", action: "bbb" } } }
        ];
		
        var mockApprovals = [
			{ private: { id: 1, approver : "approver2" }, metadata: { fingerprints: { sync: "1111", action: "aaaa" } } },
			{ private: { id: 2, approver : "approver" }, metadata: { fingerprints: { sync: "222", action: "bbb" } } }
        ];

        var expected = [
			{ id: 1, syncver: undefined, deleted: true },
			{ private: { id: 1, approver : "approver2" }, metadata: { fingerprints: { sync: "1111", action: "aaaa" } } }
		];

        syncher.sync(mockHashList, mockApprovals).should.have.deep.members(expected);
    });
});