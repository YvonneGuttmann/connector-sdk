const express = require('express');

exports.LocalServer = class server{
    constructor(connector, logger, port){
        this.connector = connector;
        this.logger = logger;
        this.app = express();
        this.port = port || 8080;
    }

    async start(){
        var logger = this.logger;
        this.app.get('/fetch', (req, res) => {
            var approvals, rawApprovals;
            function send(ap, raw){
                rawApprovals = raw;
                approvals = ap;
            }

            this.connector.sync({logger, send}).then(()=>{
                res.send(JSON.stringify({approvals, rawApprovals}));
                res.end();
            });
        });

        return new Promise((resolve, reject) => {
            try{
                this.app.listen(this.port, () => {
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

    }
};