const assert = require('assert');
const chalk = require ("chalk");

module.exports = class Flow {
    constructor(data) {
        this.verifySteps(data.steps);
        parseData(data);
        this.name = data.flowName;
        this.title = data.title;
        this.task = data.task;
        this.taskData = data.taskData;
        this.steps = data.steps || [];

        this.counter = 0;
        this.output = [];
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
        console.log(chalk.yellow(`Executing step ${this.counter - 1}: ${JSON.stringify(step)}`));

        if(step.func !== funcName) {
            let message = `Trying to call function ${funcName}. Expected function: ${step.func}`;
            this._updateError(stepOutput, this.counter, message);
        }

		if (step.args) {
			for (var i = 0; i < step.args.length; ++i) {
				if (JSON.stringify(step.args[i]) != stringify(args[i])) {
					console.log(`Mismatch in argument ${i}:`);
					console.log("expected=\n" + JSON.stringify(step.args[i]));
					console.log("actual=\n" + stringify(args[i]));
                    let message = `Function ${funcName}.\nActual arguments:\n${stringify(args)}.\nExpected arguments: \n${JSON.stringify(step.args)}`;
                    this._updateError(stepOutput, this.counter, message);
					break;
				}
			}
		}

        if(step.exception) throw step.exception;
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
				step.output = JSON.parse(stringify(retVal) || null);
				if (retVal && retVal.then) {
					retVal.then(res => step.output = JSON.parse(stringify(res) || null));
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
        return chalk.yellow(`Title: ${this.title}`) + '\n' + chalk.yellow(`Number of steps: ${this.steps.length}`);
    }

};

function parseData(o) {
    for (var i in o) {
        if (o[i] !== null && typeof(o[i])=="object") {
            parseData(o[i]);
        } else if (o[i] !== null && typeof(o[i])=="string" && o[i].indexOf(".json") !== -1){
            o[i] = require(`./data/${o[i]}`);
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
