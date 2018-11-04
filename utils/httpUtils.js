var axios = require('axios');
var BaseUtils = require("./baseUtils");
var Queue = require("./queue");

module.exports = class HttpUtils extends BaseUtils {
    constructor(options){
        super(options);

        this.requestQueue = new Queue({ concurrency : options.maxConcurrent || 10000});
        this.username = options.username;
        this.password = options.password;
        this.baseUrl = options.baseUrl;
        this.headers = options.headers || {
                "Accept": "application/json",
                "Content-Type": "application/json"
        };
    }

    async get(uri, params, body) {
        return this._callRequest("get", uri, params, body);
    }

    async put(uri, params, body) {
        return this._callRequest("put", uri, params, body);
    }

    async post(uri, params, body) {
        return this._callRequest("post", uri, params, body);
    }

    async downloadUrlAttachment(uri, mediaType) {
        var res = await this.get(uri, {responseType : 'arraybuffer'});
        return {data: new Uint8Array(res.data), mediaType: mediaType};
    }

    async _callRequest(method, uri, params, body){
        return new Promise((resolve, reject)=>{
            let func = axios[method];

            var doRequest = async ()=>{
                return func(`${this.baseUrl}${uri}`, this._getRequestOpts(params, body));
            }

            var onError = (err)=>{
                if (err.response){
                    this.logger.error(`[HttpUtils] HTTP ${method} response error: ${err.response.status} ${err.response.statusText} on ${this.baseUrl}${uri}`);
                    reject(err.response);
                } else {
                    this.logger.error(`[HttpUtils] HTTP ${method} error: ${err.code} on ${this.baseUrl}${uri}`);
                    reject(err);
                }
            }

            if (!["get", "post", "put"].includes(method)){
                reject(`HTTP request method not defined. ${method}`);
            }

            this.requestQueue.add(doRequest).then((response)=>resolve(response.data)).catch(onError);
        });
    }

    _getRequestOpts(opts, body){
        let options = Object.assign({
            headers : this.headers,
            data : body
        }, opts);

        if (this.username && this.password){
            options.auth = {
                username: this.username,
                password: this.password
            }
        }

        return options;
    }
};