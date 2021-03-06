const assert = require('assert');
const chalk = require ("chalk");
const Result = require('../../lib/Result');

module.exports = class Flow {
    constructor(data, props = {}) {
        this.verifySteps(data.steps);
		this._origData = data;
		data = JSON.parse(JSON.stringify(data));
        parseData(data);
        this.name = data.flowName;
        this.title = data.title;
        this.task = data.task;
        this.taskData = data.taskData;
        this.steps = data.steps || [];
        this.config = data.config || {};
        if(!this.config.blConfig) this.config.blConfig = {};
        if(!this.config.controllerConfig) this.config.controllerConfig = {};
        this.counter = 0;
        this.output = [];
		this.props = props || {};
		this._ignoreFuncs = props.ignoreFuncs || [];
    }

    verifySteps(step) {
        if(step instanceof Array) {
            step.forEach((s, index) => {
                if((!s.func || !s.args) && index !== step.length - 1) {
                    let message = `invalid steps.\nstep ${index} is invalid:\n${JSON.stringify(s)}`;
                    assert.fail(message);
                }
            })
        }
    }

    async exec(funcName, args) {
        if(this.error) {
            throw 'flow with error';
        }

        var stepOutput = this._factoryStepOutput(`${this.name} - ${this.title}`, funcName);
        this.output.push(stepOutput);

        if(this.counter >= this.steps.length) {
            let message = `Trying to run step ${this.counter} (function: ${funcName}) where flow length is ${this.steps.length}`;
            this._updateError(stepOutput, this.counter, message);
        }

        const step = this.steps[this.counter++];
        // console.log(chalk.yellow(`Executing step ${this.counter - 1}: ${JSON.stringify(step)}`));

        if(step.func !== funcName) {
            let message = `Trying to call function ${funcName}. Expected function: ${step.func}`;
            this._updateError(stepOutput, this.counter, message);
        }

		if (step.args) {
			for (var i = 0; i < step.args.length; ++i) {
				if (JSON.stringify(step.args[i]) != stringify(args[i])) {
					if (this._ignoreFuncs.includes(funcName)) {
						this._origData.steps[this.counter - 1].args = [...args];
						this.ignoredError = true;
						break;
					}
										
                    let message = `

Function   : ${funcName}
Argument   : ${i + 1},
Actual     : ${stringify(args[i])}
Expected   : ${JSON.stringify(step.args[i])}`;
                    this._updateError(stepOutput, this.counter, message);
					break;
				}
			}
		}

		if (step.updateState && args[0].state){
		    Object.assign(args[0].state, step.updateState);
        }

        if(step.exception) throw step.exception;

		if(step.callback && Array.isArray(step.callback)) {
		    step.callback.forEach(c => {
		        args[args.length-1](...c);
            });
        }

        if(step.outputType && step.outputType.indexOf('Result.') !== -1) {
            const status = step.outputType.split('.')[1];
            if(!step.output)
                step.output = {};
            return new Result[status](step.output.data, step.output.meta);
        }
        return step.output;
    }

    isFinished() {
        return this.steps.length === this.counter;
    }

    hasError() {
        return this.error;
    }

    getPendingSteps() {
        return this.steps.slice(this.counter);
    }

	capture(obj) {
		var $this = this;
		Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).forEach(key => {
			var origValue = obj[key];
			if (typeof origValue !== "function" || key[0] == "_") return;
			obj[key] = function() {
				var step = { func : key, args : JSON.parse(stringify(Array.from(arguments))) };
				$this.steps.push(step);
				var retVal = origValue.apply(this, arguments);
                if(retVal instanceof Result) {
                    step.outputType = `Result.${retVal.constructor.name}`;
                }

				step.output = JSON.parse(stringify(retVal) || null);
				if (retVal && retVal.then) {
					retVal.then(res => {
                        if(res instanceof Result)
                            step.outputType = `Result.${res.constructor.name}`;
					    step.output = JSON.parse(stringify(res) || null)
                    });
				}
				return retVal;
			}
		});	
	}
	
    _updateError(stepOutput, stepNumber, message) {
        this.error = {
            message: message,
            stepNumber: stepNumber,
            step: JSON.stringify(this.steps[stepNumber])
        };
        this._reportFailure(stepOutput, message);
        assert.fail(message);
    }

    _factoryStepOutput(className, name){
        return {
            className   : className,
            name        : `[${this.counter}] ${name}`,
            failure     : { status: false, message: null}
        };
    }

    _reportFailure(stepOutput, message){
        stepOutput.failure.status = true;
        stepOutput.failure.message = message;
    }

    getPreRunString() {
        return chalk.yellow(`Title: ${this.title} (${this.steps.length} steps)`);
    }

};

function parseData(o) {
    for (var i in o) {
        if (o[i] !== null && typeof(o[i])=="object") {
            parseData(o[i]);
        } else if (o[i] !== null && typeof(o[i])=="string" && o[i].indexOf(".json") !== -1){
            o[i] = require(`./utils/data/${o[i]}`);
        }
    }
}

function stringify(data) {
    return JSON.stringify(data, (key, value) => {
        if (typeof value === 'object' && !(value instanceof Array) && value && value.constructor !== Object) {
            return undefined;
        }
        return value;
    });
}
