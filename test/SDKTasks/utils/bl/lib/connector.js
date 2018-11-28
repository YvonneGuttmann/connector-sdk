class BLClass {

    constructor(options) {
        this.logger = options.logger;
        this.flow = options.flow;
    }

    static init(context) {
        BLClass.settings = context.config;
    }

    static stop() { }

    fetch() { return this.flow.exec('fetch', arguments); }

    getApproval() { return this.flow.exec('getApproval', arguments); }

    approve() { return this.flow.exec('approve', arguments); }

    reject() { return this.flow.exec('reject', arguments); }

    authenticate() { return this.flow.exec('authenticate', arguments); }

    action$reassign() { return this.flow.exec('action$reassign', arguments); }

    downloadAttachment(data) { return this.flow.exec('downloadAttachment', arguments); }

    mapUserIds(data) { return this.flow.exec('mapUserIds', arguments); }

    sendFeedback(data) { return this.flow.exec('sendFeedback', arguments); }

    uploadFeedback(data) { return this.flow.exec('uploadFeedback', arguments); }
}
module.exports = BLClass;
