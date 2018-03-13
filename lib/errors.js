module.exports = {
    codes: {
        "ERROR":                    { code: "ERROR",                  severity: "NORMAL",       name: "General error",                  description: "General error" },
        "CONNECTOR_ERROR":          { code: "CONNECTOR_ERROR",        severity: "NORMAL",       name: "Connector business logic error", description: "An unknows error has occured in the connector's business logic" },
        "SYSTEM_UNAVAILABLE":       { code: "SYSTEM_UNAVAILABLE",     severity: "NORMAL",       name: "System unavailable",             description: "Source system is unavailable, or not responsive" },
        "AUTHENTICATION":           { code: "AUTHENTICATION",         severity: "CRITICAL",     name: "Authentication error",           description: "Source system authentication failed" },
        "ATTACHMENT_NOT_FOUND":     { code: "ATTACHMENT_NOT_FOUND",   severity: "NORMAL",       name: "Attachment not found",           description: "Attachment was not found, or is not available in the source system" },
        "TASK_INVALID":             { code: "TASK_INVALID",           severity: "NORMAL",       name: "Invalid task type",              description: "Invalid task type" },
        "TASK_TIMEOUT":             { code: "TASK_TIMEOUT",           severity: "CRITICAL",     name: "Task timeout",                   description: "Task took to long to complete and was timed out." },
        "APPROVAL_DATA_MISMATCH":   { code: "APPROVAL_DATA_MISMATCH", severity: "CRITICAL",     name: "Approval data mismatch",         description: "Approval data doesn't match to the source system" },
        "APPROVAL_NOT_EXIST":       { code: "APPROVAL_NOT_EXIST",     severity: "NORMAL",       name: "Approval wasn't found",          description: "approval wasn't found in the source system or is not pending" }
    },
    get(code) {
        return (code in this.codes) ? this.codes[code] : this.codes["ERROR"];
    }
}

