module.exports = {
    codes: {
        "ERROR":                    { code: "ERROR",                    name: "General error",                  description: "General error" },
        "CONNECTOR_ERROR":          { code: "CONNECTOR_ERROR",          name: "Connector business logic error", description: "An unknows error has occured in the connector's business logic" },
        "SYSTEM_UNAVAILABLE":       { code: "SYSTEM_UNAVAILABLE",       name: "System unavailable",             description: "Source system is unavailable, or not responsive" },
        "AUTHENTICATION":           { code: "AUTHENTICATION",           name: "Authentication error",           description: "Source system authentication failed" },
        "ATTACHMENT_NOT_FOUND":     { code: "ATTACHMENT_NOT_FOUND",     name: "Attachment not found",           description: "Attachment was not found, or is not available in the source system" },
        "TASK_INVALID":             { code: "TASK_INVALID",             name: "Invalid task type",              description: "Invalid task type" },
        "TASK_TIMEOUT":             { code: "TASK_TIMEOUT",             name: "Task timeout",                   description: "Task took to long to complete and was timed out." },
        "APPROVAL_DATA_MISMATCH":   { code: "APPROVAL_DATA_MISMATCH",   name: "Approval data mismatch",         description: "Approval data doesn't match to the source system" },
    },
    get(code) {
        return (code in this.codes) ? this.codes[code] : this.codes["ERROR"];
    }
}

