function Result(status, data = {}, meta = {}) {
    if (status instanceof Result) return status;
    if (!(this instanceof Result)) return new Result.Success(status, {});
    if (this.constructor === Result) throw "ABSTRACT_CLASS";

    this.status = status;
    this.meta = meta;
    if(this.meta === null) this.meta = {};
    this.data = data;
    if(this.data === null) this.data = {};
}

Result.prototype = {
    addMeta(name, value) {
        this.meta[name] = value;
    },

    toJSON() {
      return {
          data: this.data,
          meta: this.meta
      };
    }
};

class Success extends Result {
    constructor(data, meta) {
        super("Success", data, meta);
    }
}

class Timeout extends Result {
    constructor(data, meta) {
        super("Timeout", data, meta);
    }
}

class NotFound extends Result {
    constructor(data, meta) {
        super("NotFound", data, meta);
    }
}

class AuthenticationError extends Result {
    constructor(data, meta) {
        super("AuthenticationError", data, meta);
    }
}

class DataMismatch extends Result {
    constructor(data, meta) {
        super("DataMismatch", data, meta);
    }
}

class BadArguments extends Result {
    constructor(data, meta) {
        super("BadArguments", data, meta);
    }
}

class NotImplemented extends Result {
    constructor(data, meta) {
        super("NotImplemented", data, meta);
    }
}

class InternalError extends Result {
    constructor(data, meta) {
        super("InternalError", data, meta);
    }
}

class ServiceUnavailable extends Result {
    constructor(data, meta) {
        super("ServiceUnavailable", data, meta);
    }
}

class SystemError extends Result {
    constructor(data, meta) {
        super("SystemError", data, meta);
    }
}

module.exports = Result;

Object.assign(module.exports, { Success, Timeout,  NotFound, AuthenticationError, DataMismatch, BadArguments, NotImplemented, InternalError, ServiceUnavailable, SystemError });
