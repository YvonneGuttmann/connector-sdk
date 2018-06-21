const assert = require('assert');
const chalk = require ("chalk");

module.exports = class Flow {

    constructor(data) {
        // if(!data.expectedResult) assert.fail(`Expected result is not defined`);
        this.verifySteps(data.steps);
        // this.expectedResult = data.expectedResult;
        this.title = data.title;
        this.task = data.task;
        this.steps = data.steps;
        this.counter = 0;
    }

    verifySteps(step) {
        if(step instanceof Array) {
            step.forEach((s, index) => {
                if((!s.func || !s.args || !s.output) && index !== step.length - 1) {
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

        if(JSON.stringify(step.args) !== stringify(Array.from(args))) {
            this._updateError(this.counter, `Function ${funcName}. Actual arguments ${JSON.stringify(args)}. Expected arguments: ${JSON.stringify(step.args)}`);
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