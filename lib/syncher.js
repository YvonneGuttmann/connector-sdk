/**
 * Provides a sync function that synchronizes a hashList to the approval list (that contains signature) into added / removed / updated lists
 * input:
 *      hashList = {id, signature}
 *      approvals = a full approval object with id and signature.
 * output: result = {
 *      added   -> array of approvals
 *      updated -> array of approvals
 *      removed -> array of approval ids
 */

module.exports = class Syncher {
	constructor(signatureList) {
		this._signatureList = signatureList;
		this._signatureMap = Object.create(null);
		this._newApprovalsMap = Object.create(null);
		for (var i = 0; i < signatureList.length; ++i)
			this._signatureMap[signatureList[i].private.id] = signatureList[i];
		this.stats = { added : 0, updated : 0, removed : 0, error : 0 };
	}
	
	syncChunk(approvals) {
		var resApprovals = [];
		approvals.forEach(curApproval => {
			this._newApprovalsMap[curApproval.private.id] = 1;
			var oldApproval = this._signatureMap[curApproval.private.id]
			
			if (curApproval.error) {
				++this.stats.error;
			} else if (curApproval.deleted) {
				if (oldApproval) {
					++this.stats.removed;
					resApprovals.push({id: oldApproval.id, syncver: oldApproval.syncver, deleted: true});
				}
			} else if (!oldApproval) {
				++this.stats.added;
				resApprovals.push(curApproval);
			} else if (curApproval.private.approver != oldApproval.private.approver) {
				// In case the approval was found but changed owner, we need to remove it and create a new one, and not update the existing one.
				++this.stats.added;
				++this.stats.removed;
				resApprovals.push({id: oldApproval.id, syncver: oldApproval.syncver, deleted: true});
				resApprovals.push(curApproval);
			} else if (!oldApproval.metadata || !oldApproval.metadata.fingerprints ||
					oldApproval.metadata.fingerprints.sync != curApproval.metadata.fingerprints.sync ||
					oldApproval.metadata.fingerprints.action != curApproval.metadata.fingerprints.action) {
				++this.stats.updated;
				resApprovals.push(Object.assign({}, oldApproval, curApproval));
			}
		});
		var stats = this.stats;
		stats.errorRate = stats.error / ((stats.added + stats.updated + stats.error) || 1);
		return resApprovals;
	}
	
	calcRemoved() {
		var removed = this._signatureList
			.filter(oldApproval => !this._newApprovalsMap[oldApproval.private.id])
			.map(a => ({id: a.id, syncver: a.syncver, deleted: true}));

		var stats = this.stats;
		stats.removed += removed.length;
		stats.errorRate = stats.error / ((stats.added + stats.updated + stats.error) || 1);
		return removed;
	}
	
	static sync(signatureList, approvals) {
		var syncher = new Syncher(signatureList);
		return syncher.syncChunk(approvals).concat(syncher.calcRemoved());	
	}
};
