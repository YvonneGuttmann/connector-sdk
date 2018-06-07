const express = require('express');
const jslt = require('jslt');
const cors = require('cors');
const sse = require('./sse');

function getUITemplateData(approval, UITemplate){
    try{
        return UITemplate && jslt.transform(approval, UITemplate);
    } catch (ex){
        console.log(`UI mapping error ${ex}`);
        return ex;
    }
}

exports.LocalServer = class server{
    constructor(TaskClasses, logger, port){
        this.TaskClasses = TaskClasses;
        this.logger = logger;
        this.app = express();
        this.port = port || 8080;
        this.syncCounter = 0;
        this.connections = [];
        this.app.use(cors());
    }

    setTaskClasses(TaskClasses){
        this.TaskClasses = TaskClasses;
    }

    async start(){
        var logger = this.logger;
        this.app.get('/fetch', async (req, res) => {
            var taskId = "sync-" + this.syncCounter++;
            var task = new this.TaskClasses.Task({ id : taskId, type : "sync" }),
                backend = task.backend, result;

            try{
                await task.execute();
                var approvalsResult = backend.getApprovalState(),
                    taskStatus = backend.getTaskStatus(taskId);

                approvalsResult.forEach(approvalsObj=>{
                    approvalsObj.uiApprovals = approvalsObj.transformedApprovals.map(approval=>getUITemplateData(approval.public, backend.getUITemplate(approval.schemaId)));
                });

                result = JSON.stringify({approvalsResult, taskStatus});
            } catch(ex){
                result = `Sync error ${ex.stack}`;
            }

            res.send(result);
            res.end();
        });

        this.app.get('/ServerMessages', async (req, res)=>{
            sse(res);
            res.sseSetup();
            this.connections.push(res);
        });

        return new Promise((resolve, reject) => {
            try{
                this.server = this.app.listen(this.port, () => {
                    logger.info(`Local server listening on port ${this.port}!`);
                    resolve();
                })
            } catch (ex){
                logger.error(`Error loading Local server on port ${this.port}. Error ${ex}`);
                reject(ex);
            }
        });
    }

    async stop(){
        var logger = this.logger;
        return new Promise((resolve, reject) => {
            try{
                this.connections.forEach(res=>{
                    res.sseSend("Close");
                    res.connection.end();
                });
                resolve();
            } catch (ex){
                logger.error(`Error closing local server ${this.port}. Error ${ex}`);
                reject(ex);
            }
        });
    }

    onFileChanged(context){
        this.connections.forEach(res=>{
            res.sseSend("FileChanged", {filePath : context.event})
        });
    }
};