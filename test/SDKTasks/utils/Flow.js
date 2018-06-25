const assert = require('assert');
const chalk = require ("chalk");

module.exports = class Flow {
    constructor(data) {
        // if(!data.expectedResult) assert.fail(`Expected result is not defined`);
        this.verifySteps(data.steps);
        // this.expectedResult = data.expectedResult;
        this.title = data.title;
        this.task = data.task;
        this.steps = data.steps || [];
        this.counter = 0;
    }

    verifySteps(step) {
        if(step instanceof Array) {
            step.forEach((s, index) => {
                if((!s.func || !s.args) && index !== step.length - 1) {
                    assert.fail(`invalid steps.\nstep ${index} is invalid:\n${JSON.stringify(s)}`);
                }
            })
        }
    }

    async exec(funcName, args) {
        if(this.error) {
            throw 'flow with error';
        }

        if(this.counter >= this.steps.length) {
            this._updateError(this.counter, `Trying to run step ${this.counter} (function: ${funcName}) where flow length is ${this.steps.length}`);
        }

        const step = this.steps[this.counter++];
        console.log(chalk.yellow(`Executing step ${this.counter - 1}: ${JSON.stringify(step)}`));

        if(step.func !== funcName) {
            this._updateError(this.counter, `Trying to call function ${funcName}. Expected function: ${step.func}`);
        }

		if (step.args) {
			for (var i = 0; i < step.args.length; ++i) {
				if (JSON.stringify(step.args[i]) != stringify(args[i])) {
					console.log(`Mismatch in argument ${i}:`);
					console.log("expected=" + JSON.stringify(step.args[i]));
					console.log("actual=" + stringify(args[i]));
					this._updateError(this.counter, `Function ${funcName}. Actual arguments ${stringify(args)}. Expected arguments: ${JSON.stringify(step.args)}`);
					break;
				}
			}
		}
		
//      if(JSON.stringify(step.args) !== stringify(Array.from(args))) {
//          this._updateError(this.counter, `Function ${funcName}. Actual arguments ${stringify(args)}. Expected arguments: ${JSON.stringify(step.args)}`);
//      }

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
	
    _updateError(stepNumber, message) {
        this.error = {
            message: message,
            stepNumber: stepNumber,
            step: JSON.stringify(this.steps[stepNumber])
        };
        assert.fail(message);
    }

    getPreRunString() {
        return chalk.yellow(`Title: ${this.title}`) + '\n' + chalk.yellow(`Number of steps: ${this.steps.length}`);
    }
};

function stringify(data) {
    return JSON.stringify(data, (key, value) => {
        if (typeof value === 'object' && !(value instanceof Array) && value && value.constructor !== Object) {
            return undefined;
        }
        return value;
    });
}