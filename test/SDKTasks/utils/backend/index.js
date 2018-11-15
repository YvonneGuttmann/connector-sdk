const path = require('path');
const defaultConfig = {
	bulkSize : 100000
};

var TestAPI = module.exports = class TestAPI {
	constructor(options) {
	    this.signatureList = options.signatureList;
	    this.flow = options.flow;
	}

    async updateTask(){
        return this.flow.exec('updateTask', arguments);
    }
		
	async updateTaskInProgress() {
	}
	
    async getBackendApprovals(){
        return this.flow.exec('getBackendApprovals', arguments);
    }
	
    async getBackendApproval() {
        return this.flow.exec('getBackendApproval', arguments);
    }
	
    async sendApprovals() {
        return this.flow.exec('sendApprovals', arguments);
    }
	
	async sendAttachment() {
        return this.flow.exec('sendAttachment', arguments);
	}

	async sendUserIds(data) {
        return this.flow.exec('sendUserIds', arguments);
	}

    async sendFeedback() {
        return this.flow.exec('sendFeedback', arguments);
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

    async getConnectorState(){
        return this.flow.exec('getConnectorState', arguments);
    }

    async setConnectorState(){
        return this.flow.exec('setConnectorState', arguments);
    }


};