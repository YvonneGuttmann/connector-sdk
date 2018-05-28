const defaultConfig = {
	bulkSize : 100000
};

var LocalAPI = module.exports = class LocalAPI {
	constructor(config) {
		this.syncver = 0;
		this.dataCache = {};
		this.config = Object.assign({}, defaultConfig, config);
	}

    async updateTask(taskId, params = {}){

    }
		
	async updateTaskInProgress(taskId) {

	}
	
    async getBackendApprovals(options){
        return Object.values(LocalAPI.approvals);
    }
	
    async getBackendApproval({logger, id}) {
        return this.getBackendApprovals();
    }
	
    async sendApprovals(approvals, rawApprovals, options) {
        approvals.forEach(ap=>LocalAPI.approvals[ap.private.id]=ap);
        LocalAPI.approvalsState.push({approvals, rawApprovals});
    }
	
	async sendAttachment(taskId, contentType, stream) {
		/*return axios({
			method: "POST",
			url: `${this.apiUrl}/resources/${taskId}`,
			headers: Object.assign({"Content-Type" : contentType || "application/octet-stream"}, this.requestHeaders),
			data: stream
		});*/
	}

	async sendUserIds(data) {
		return this._request("post", `/connectors/usermapping`, data);
	}

	getApprovalState(){
    	var res = LocalAPI.approvalsState.slice();
        LocalAPI.approvalsState = [];
        return res;
	}
};

LocalAPI.approvals = {};
LocalAPI.approvalsState = [];