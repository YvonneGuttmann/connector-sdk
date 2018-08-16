
const axios = require('axios');
const FormData = require('form-data');

const defaultConfig = {
	bulkSize : 100000
};

module.exports = class BackendAPI {
	constructor(apiUrl, requestHeaders, config) {
		this.syncver = 0;
		this.dataCache = {};
		this.apiUrl = apiUrl;
		this.requestHeaders = requestHeaders;
		this.config = Object.assign({}, defaultConfig, config);
	}

    async updateTask(taskId, params = {}){
        return this._request("patch", `/connectors/tasks/${taskId}`, params);
    }
		
	async updateTaskInProgress(taskId) {
		return this._request("patch", `/connectors/tasks/${taskId}`, { progress: 50 });
	}
	
    async getBackendApprovals(options){
        try{
            options.logger.info("Fetching approvals for sync from backend. syncver:" + this.syncver);
            var response = await this._request("get", `/rawapprovals?syncver=${this.syncver}`),
                currentData = response.data;

            options.logger.info(`Fetched ${currentData.length} approvals from backend`);

            if (currentData && currentData.length){
                currentData.forEach(serverApproval=>{
                    if (serverApproval.syncver > (this.syncver || -1)) {
                        this.syncver = serverApproval.syncver;
                    }

                    this._updateApprovalInCache(serverApproval);
                });
			}
			
            return Object.values(this.dataCache);
        } catch (error){
            options.logger.error("getBackendApprovals failed");

            throw error;
        }
    }
	
    async getBackendApproval({logger, id}) {
        logger.log(`Fetching approval '${id}' from backend`);
        try {
            var response = await this._request("get", `/rawapprovals/${id}`),
                serverApproval = response.data;
            this._updateApprovalInCache(serverApproval);
            return Object.values(this.dataCache);
        }
        catch (ex) {
            throw new Error(`Error fetching approval '${id}' from backend: ${ex.message || ex}`);
        }
    }
	
    async sendApprovals(approvalsData, options) {
    	var approvals = approvalsData.approvals;
		try {
			var bulk = [], promises = [], bulkSize = 0;
			for (var i = 0; i < approvals.length; i++){
				var approval = approvals[i],
					approvalSize = JSON.stringify(approval).length;

				if (approvalSize > this.config.bulkSize){
					options.logger.error(`Approval is to large and cannot be sent to server: ${approval.private.id} , size: ${approvalSize}`);
					continue;
				}

				if (bulkSize + approvalSize > this.config.bulkSize){
					options.logger.log(`Sending bulk update length: ${bulk.length}, size: ${bulkSize}`);
					promises.push(this._request("post", `/rawapprovals`, bulk));
					bulk = [];
					bulkSize = 0;
				}

				bulk.push(approval);
				bulkSize += approvalSize;
			}

			if (bulk.length){
				options.logger.log(`Sending bulk update length: ${bulk.length}, size: ${bulkSize}`);
				promises.push(this._request("post", `/rawapprovals`, bulk));
			}

			await Promise.all(promises);
		} catch(ex) {
			options.logger.error(`Failed to send approvals: ${ex}`);
		}
    }
	
	async sendAttachment(taskId, contentType, stream) {
		return axios({
			method: "POST",
			url: `${this.apiUrl}/resources/${taskId}`,
			headers: Object.assign({"Content-Type" : contentType || "application/octet-stream"}, this.requestHeaders),
			data: stream
		});
	}

	async sendUserIds(data) {
		return this._request("post", `/connectors/usermapping`, data);
	}

	async getUITemplate(schemaId) {
    	try{
            var response = await this._request("get", `/uimappings?schemaId=${schemaId}`);
            if (!response.data[0]) throw `UITemplate with schema id not exists`;
			return response.data[0].uiTemplate;
		} catch (ex) {
			//this.logger.error(`Failed to get UITemplate of schemaId ${schemaId} from the backend: ${JSON.stringify(ex)}`);
			return null;
		}
	}

    async sendConnectorData(data) {
        return this._request("patch", `/connectors/${this.config.connectorId}`, data);
    }

	async sendFeedback(msg, zipFile) {
		var bodyFormData = new FormData({ maxBodyLength: 500 * 1024 * 1024 * 1024 }); // 500 GB
		bodyFormData.append("feedback_text", `#rnd #approvalsFeedback #connector ${msg}`);
		bodyFormData.append("timestamp", Date.now());
		bodyFormData.append("email", "feedbacks.debug@capriza.com");
		bodyFormData.append("feedback_via", "login-screen");
		bodyFormData.append("metadata", JSON.stringify({ session_id : "123" }));
		bodyFormData.append("stats", JSON.stringify({ sessionId : "123" }));
		bodyFormData.append("feedback", require("fs").createReadStream(zipFile), "feedback.zip");

		return axios.post(this.config.feedbackUrl, bodyFormData, { headers : bodyFormData.getHeaders() });
	}
	
	_request(method, url, data) {
		return axios({
			method	: method,
			url		: this.apiUrl + url,
			data	: data,
			headers : this.requestHeaders
		});
	}
	
	_updateApprovalInCache (serverApproval){
        if (!serverApproval.deleted){
            this.dataCache[serverApproval.id] = serverApproval;
        } else {
            delete this.dataCache[serverApproval.id];
        }
    }
};
