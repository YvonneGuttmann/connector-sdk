const express = require('express');

exports.LocalServer = class server{
    constructor(TaskClasses, logger, port){
        this.TaskClasses = TaskClasses;
        this.logger = logger;
        this.app = express();
        this.port = port || 8080;
        this.syncCounter = 0;
    }

    async start(){
        var logger = this.logger;
        this.app.get('/fetch', async (req, res) => {
            var task = new this.TaskClasses.Task({ id : "sync-" + this.syncCounter++, type : "sync" }),
                backend = task.backend;

            //await
            task.execute()
                .then(()=>{
                    res.send(JSON.stringify(backend.getApprovalState()));
                    res.end();
                })
                .catch((ex)=>{
                    res.send(`Sync error ${ex.stack}`);
                    res.end();
                });
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