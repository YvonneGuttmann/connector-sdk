const express = require('express');
const jslt = require('jslt');
const cors = require('cors')

function getUITemplateData(approval, UITemplate){
    try{
        return UITemplate && jslt.transform(approval.public, UITemplate);
    } catch (ex){
        return ex.message;
    }
}

exports.LocalServer = class server{
    constructor(TaskClasses, logger, port){
        this.TaskClasses = TaskClasses;
        this.logger = logger;
        this.app = express();
        this.port = port || 8080;
        this.syncCounter = 0;

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

        return new Promise((resolve, reject) => {
            try{
                this.server = this.app.listen(this.port, () => {
                    console.log(`Local server listening on port ${this.port}!`);
                    resolve();
                })
            } catch (ex){
                console.log(`Error loading Local server on port ${this.port}. Error ${ex}`);
                reject(ex);
            }

        });
    }

    async stop(){
        return new Promise((resolve, reject) => {
            try{
                if (this.server){
                    this.server.close(()=>{
                        console.log(`Local server closing. Stop listening on port ${this.port}`);
                        resolve();
                    });
                } else {
                    resolve();
                }
            } catch (ex){
                console.log(`Error closing local server ${this.port}. Error ${ex}`);
                reject(ex);
            }

        });



    }
};