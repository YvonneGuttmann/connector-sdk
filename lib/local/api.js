const path = require('path');
const defaultConfig = {
	bulkSize : 100000
};

var LocalAPI = module.exports = class LocalAPI {
	constructor(config) {
		this.syncver = 0;
		this.dataCache = {};
		this.config = Object.assign({}, defaultConfig, config);
        this.taskStatus = {};
        this.uiTemplates = {};
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
        approvalsObj.approvals.forEach(ap=>{
            if (ap.deleted){
                delete LocalAPI.approvals[ap.id];
                return;
            }

            if (!ap.id) {
                ap.id = ap.private.id;
            }
            LocalAPI.approvals[ap.id]=ap;
        });
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

    getUITemplate(schemaId) {
        try{
            if (this.uiTemplates[schemaId]){
                return this.uiTemplates[schemaId];
            }

            var uiTemplates = require(path.resolve(`./resources/ui-templates.json`));
            return this.uiTemplates[schemaId] = uiTemplates[schemaId];
        } catch (ex){
            return null;
        }
    }

	getApprovalState(){
    	var res = LocalAPI.approvalsState.slice();
        LocalAPI.approvalsState = [];
        return res;
	}

    getTaskStatus(taskId){
        return this.taskStatus[taskId];
    }
};


LocalAPI.resetState = ()=>{
    LocalAPI.approvals = {};
    LocalAPI.approvalsState = [];
};

LocalAPI.resetState();