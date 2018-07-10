const fs = require('fs');
const chalk = require("chalk");
const path = require('path');
var Connector = require("../../lib/connector").Connector;
var Logger = require("../../lib/log").Logger;
var loggerFactory = new Logger(process.env.logStream);
var logger = loggerFactory.create({}).child({component: "index.js", module: "connectors", connectorName: "MOCK", connectorVersion: ""});
const BL = require('./utils/bl/index');
const Backend = require('./utils/backend/index');
var handlers = require("../../lib/taskHandlers.js");
var TaskFactory = require("../../lib/task.js");
const Flow = require('./Flow');
const assert = require('assert');
var testsFlowsErrors = [];
var TestAnalyzer = require("./utils/junitBuilder.js");
var testAnalyzer = new TestAnalyzer('flow-test-report.xml');

async function runTestFlow(flowData, index) {

    var flow = new Flow(flowData);
    console.log(flow.getPreRunString());
    const bl = new BL({logger, flow});
    Connector.init({
        config: {controllerConfig: {}}, logger: logger, BL: bl, transform: (a) => {
            return a
        }
    });
    var TaskClasses = createTaskClasses({timeout: 3000}, () => new Backend({signatureList: [], flow}));
    var task = new TaskClasses.Task(flow.taskData);

    try {
        await task.execute();
    } catch (ex) {

    }

    postProcess(flow);
}

function createTaskClasses(config, backendFactory) {
    return TaskFactory({
        handlers,
        config,
        backendFactory,
        Connector,
        logger
    });
}

function postProcess(flow) {
    testAnalyzer.addJunitSuite(`[Total ${flow.steps.length} steps] ${flow.title}`, flow.output);

    var error;
    if (flow.hasError()) {
        error = `${JSON.stringify(flow.hasError())}`;
    } else if (!flow.isFinished()) {
        error = `Steps are still exists in the flow ${JSON.stringify(flow.getPendingSteps())}`;
    }

    if (error) {
        console.log(chalk.red(`Error in test flow: ${error}`));
        console.log(chalk.red(`Test flow status: failed`));
        testsFlowsErrors.push({ message: error });
    } else {
        console.log(chalk.green(`Test flow status: succeeded`));
    }
}


async function start() {
    const flows = fs.readdirSync(path.join(__dirname,'./flows/'));

    console.log(chalk.yellow(`Running tests flows`));
    console.log(chalk.yellow(`Total tests flows: ${flows.length}`));
    console.log(chalk.yellow(`------------------------------------------------`));

    for (var i = 0; i < flows.length; i++) {
        console.log(chalk.yellow(`Running test flow #${i + 1}`));
        var flowData = require(path.join(__dirname,'./flows/' + flows[i]));
        Object.assign(flowData, {flowName: flows[i].split(".json")[0]});
        await runTestFlow(flowData, i);
        console.log(chalk.yellow(`finished test flow #${i + 1}`));
        console.log(chalk.yellow(`------------------------------------------------`));
    }

    testAnalyzer.writeReport();

}

(async function runTests() {
    await start();
    if (testsFlowsErrors.length === 0) {
        console.log(chalk.green(`Done`));
    } else {
        console.log(chalk.red(`Done with ${testsFlowsErrors.length} errors`));
        console.log(chalk.red(`Errors: \n${JSON.stringify(testsFlowsErrors)}`));
    }
    process.exit(0);

})();
