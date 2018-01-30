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

module.exports = {
    sync (hashList, approvals, options){
        var result = {
            added: [],
            removed: [],
            updated: []
        };

        hashList.filter(app=>!app.deleted).forEach (hashListApproval => {
            var existingApproval = approvals.find(approval => approval.private.id == hashListApproval.private.id);
            if (!existingApproval)
                return result.removed.push ({id: hashListApproval.id, syncver: hashListApproval.syncver, deleted: true});
            else if (hashListApproval.private.approver != existingApproval.private.approver){
                //in case the approval was found but changed owner, we need to remove it and create a new one, and not update the existing one.
                result.removed.push ({id: hashListApproval.id, syncver: hashListApproval.syncver, deleted: true});
                result.added.push (existingApproval);
            }
            else if (!hashListApproval.metadata || !hashListApproval.metadata.fingerprints ||
                hashListApproval.metadata.fingerprints.sync != existingApproval.metadata.fingerprints.sync ||
                hashListApproval.metadata.fingerprints.action != existingApproval.metadata.fingerprints.action)
                result.updated.push (Object.assign({}, hashListApproval, existingApproval));
        });

        result.added = approvals.filter (approval => !hashList.find (hashListApproval => hashListApproval.private.id == approval.private.id));

        options.logger.info(`[syncher] Sync complete. added:${result.added.length}, removed: ${result.removed.length}, updated: ${result.updated.length}`);
        return result.added.concat(result.removed).concat(result.updated);
    }
}