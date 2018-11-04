module.exports = class BaseUtils {
    constructor({logger}){
        //TODO: Change to controller logger
        this.logger = logger || console;
    }
}