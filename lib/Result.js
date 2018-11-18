function Result(status, data = {}, meta = {}) {
    if (status instanceof Result) return status;
    if (status && status._result_)
        return new Result[status.status](status.data, status.meta);

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
          _result_  : 1,
          status    : this.status,
          data      : this.data,
          meta      : this.meta
      };
    }
};

const Types = {
    Success: class extends Result {
        constructor(data, meta) {
            super("Success", data, meta);
        }
    },

    Timeout: class extends Result {
        constructor(data, meta) {
            super("Timeout", data, meta);
        }
    },

    NotFound: class extends Result {
        constructor(data, meta) {
            super("NotFound", data, meta);
        }
    },

    AuthenticationError: class extends Result {
        constructor(data, meta) {
            super("AuthenticationError", data, meta);
        }
    },

    DataMismatch: class  extends Result {
        constructor(data, meta) {
            super("DataMismatch", data, meta);
        }
    },

    BadArguments: class  extends Result {
        constructor(data, meta) {
            super("BadArguments", data, meta);
        }
    },

    NotImplemented: class extends Result {
        constructor(data, meta) {
            super("NotImplemented", data, meta);
        }
    },

    InternalError: class extends Result {
        constructor(data, meta) {
            super("InternalError", data, meta);
        }
    },

    ServiceUnavailable: class extends Result {
        constructor(data, meta) {
            super("ServiceUnavailable", data, meta);
        }
    },

    SystemError: class extends Result {
        constructor(data, meta) {
            super("SystemError", data, meta);
        }
    }
};

module.exports = Result;
Object.keys(Types).forEach(type => module.exports[type] = Types[type]);
