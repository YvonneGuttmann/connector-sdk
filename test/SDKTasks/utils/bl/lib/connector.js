class BLClass {

    constructor(options) {
        this.logger = options.logger;
        this.flow = options.flow;
    }

    static init(context) { this.config = context.config; }

    static stop() { }

    fetch() { return this.flow.exec('fetch', arguments); }

    getApproval() { return this.flow.exec('getApproval', arguments); }

    approve() { return this.flow.exec('approve', arguments); }

    reject() { return this.flow.exec('reject', arguments); }

    downloadAttachment(data) { return this.flow.exec('downloadAttachment', arguments); }

}

module.exports = BLClass;
