const defaultConfig = {
	bulkSize : 100000
};

var LocalAPI = module.exports = class LocalAPI {
	constructor(config) {
		this.syncver = 0;
		this.dataCache = {};
		this.config = Object.assign({}, defaultConfig, config);
        this.taskStatus = {};
	}

    async updateTask(taskId, params = {}){
        this.taskStatus[taskId] = params;
    }
		
	async updateTaskInProgress(taskId) {

	}
	
    async getBackendApprovals(options){
        return Object.values(LocalAPI.approvals);
    }
	
    async getBackendApproval({logger, id}) {
        return this.getBackendApprovals();
    }
	
    async sendApprovals(approvalsObj) {
        approvalsObj.approvals.forEach(ap=>LocalAPI.approvals[ap.private.id]=ap);
        LocalAPI.approvalsState.push(approvalsObj);
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

	}

    async getUITemplate(schemaId) {
        return null;
    }

	getApprovalState(){
    	var res = LocalAPI.approvalsState.slice();
        LocalAPI.approvalsState = [];
        return res;
	}
};


LocalAPI.resetState = ()=>{
    LocalAPI.approvals = {};
    LocalAPI.approvalsState = [];
};

LocalAPI.resetState();