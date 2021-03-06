
const axios = require('axios');
const fs = require('fs');
const HttpUtils = require('@capriza/http-utils');

const defaultConfig = {
	bulkSize : 100000
};

const httpUpdate = new HttpUtils({ limit : 20, interval : 60*1000, maxConcurrent : 10});
const httpDefault = new HttpUtils({ limit : 20, interval : 60*1000, maxConcurrent : 10});

module.exports = class BackendAPI {
	constructor(apiUrl, requestHeaders, config) {
		this.syncver = 0;
		this.dataCache = {};
		this.apiUrl = apiUrl;
		this.requestHeaders = requestHeaders;
		this.config = Object.assign({}, defaultConfig, config);
	}

    async updateTask(taskId, params = {}){
        return this._request("patch", `/connectors/tasks/${taskId}`, params, httpUpdate);
    }
		
	async updateTaskInProgress(taskId) {
		return this._request("patch", `/connectors/tasks/${taskId}`, { progress: 50 }, httpUpdate);
	}
	
    async getBackendApprovals(options){
        try{
            options.logger.info("Fetching approvals for sync from backend. syncver:" + this.syncver);
            var currentData = await this._request("get", `/rawapprovals?syncver=${this.syncver}`);

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
            var serverApproval = await this._request("get", `/rawapprovals/${id}`);
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
        return httpDefault.post(`/resources/${taskId}`, {
			baseURL : this.apiUrl,
            headers	: Object.assign({"Content-Type" : contentType || "application/octet-stream"}, this.requestHeaders),
            data	: stream
        });
	}

	async sendUserIds(data) {
		return this._request("post", `/connectors/usermapping`, data);
	}

    async sendConnectorData(data) {
        return this._request("patch", `/connectors/${this.config.connectorId}`, data);
    }

    async sendFeedback(zipPath, metaData, logger) {
        try {
            var feedbackData = await this._request("post", `/connectors/feedback`, metaData);
        } catch (err) {
            logger.error("failed to get upload url: " + err);
            throw err
        }
        try {
            await this.uploadFeedback(feedbackData.uploadUrl, zipPath);
        } catch (err) {
            logger.error("failed to upload feedback: " + err);
            throw err
        }
    }

    //todo: need to implement to promisify
    uploadFeedback(url, filePath) {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, async (err, data) => {
                if (err) {
                    throw err;
                }
                var axiosInstance = axios.create({headers: {'Content-Type': "application/zip"}});
                axiosInstance({
                    method: "PUT",
                    url: url,
                    data: data,
                }).then(function (response) {
                    resolve(response);
                }).catch(function (error) {
                    reject(error)
                })
            });
        })
    }

	async getConnectorState({logger}){
        try {
            var connectorState = await this._request("get", `/connectors/state`);

            logger.debug(`state ${connectorState && JSON.stringify(connectorState)}`);
            connectorState.state = connectorState.state || {};
            return connectorState;
        }
        catch (ex) {
            throw new Error(`Error fetching connector state from backend: ${ex.message || ex}`);
        }
	}

    async setConnectorState({logger, connectorState}){
        try {
            logger.debug(`Update connector state. Data ${connectorState && JSON.stringify(connectorState)}`);
            await this._request("post", `/connectors/state`, connectorState);
        }
        catch (ex) {
            throw new Error(`Error while updating connector state: ${ex.message || ex}`);
        }
    }

	_request(method, uri, data, httpUtils = httpDefault) {
        return httpUtils._callRequest(method, uri, {
			baseURL	: this.apiUrl,
			headers : this.requestHeaders,
            data	: data
        });

        /*
         return axios({
         method	: method,
         url		: this.apiUrl + url,
         data	: data,
         headers : this.requestHeaders
         });
         */
	}
	
	_updateApprovalInCache (serverApproval){
        if (!serverApproval.deleted){
            this.dataCache[serverApproval.id] = serverApproval;
        } else {
            delete this.dataCache[serverApproval.id];
        }
    }
};
