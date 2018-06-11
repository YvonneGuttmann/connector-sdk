const express = require('express');
const jslt = require('jslt');
const cors = require('cors');
const sse = require('./sse');
const bodyParser = require("body-parser");

function getUITemplateData(approval, UITemplate, props = {}){
    var res;
    props.continueOnError = true;

    try{
        res = UITemplate && jslt.transform(approval, UITemplate, props);
    } catch (ex){
        res = ex.result;
        res.jsltErrors = ex.errors;
    }

    return res;
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
        this.app.use(bodyParser.urlencoded({ extended: false }));
        this.app.use(bodyParser.json());
    }

    setTaskClasses(TaskClasses){
        this.TaskClasses = TaskClasses;
    }

    generateTaskId(){
        return "task-" + this.syncCounter++;
    }

    async start(){
        var logger = this.logger;
        this.app.get('/fetch', async (req, res) => {
            var taskId = this.generateTaskId();
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

        this.app.post('/action',async (req,res)=>{
            var data = req.body.data;
            this.logger.info(`Action Data ${JSON.stringify(data)}`);

            var taskId = data.id = this.generateTaskId();
            var task = new this.TaskClasses.Task(data),
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
                result = `Action error ${ex.stack}`;
            }

            res.send(result);
            res.end();
        });

        this.app.get('/ServerMessages', async (req, res)=>{
            function onReqEnd() {
                req.removeListener("close", onReqEnd);
                req.removeListener("end", onReqEnd);
                clearInterval(timer);
                connections.splice(connections.indexOf(res), 1);
            }
            var connections = this.connections;
            sse(res);
            res.sseSetup();
            var timer = setInterval(() => res.write(`:1\n\n`), 30000); //Keep connection active
            req.on("close", onReqEnd).on("end", onReqEnd);
            connections.push(res);
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