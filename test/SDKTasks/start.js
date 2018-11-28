const fs = require('fs');
const chalk = require("chalk");
const path = require('path');
var Connector = require("../../lib/connector").Connector;
var Logger = require("../../lib/log").Logger;
var logger = new Logger({ consoleMode : "text" });
const BL = require('./utils/bl/index');
const Backend = require('./utils/backend/index');
var handlers = require("../../lib/taskHandlers.js");
var TaskFactory = require("../../lib/task.js");
const Flow = require('./Flow');
const assert = require('assert');
var testsFlowsErrors = [];
var TestAnalyzer = require("./utils/junitBuilder.js");
var testAnalyzer = new TestAnalyzer('flow-test-report.xml');
var ignoreFuncs;

async function runTestFlow(flowData) {
    var flow = new Flow(flowData, { ignoreFuncs });
    console.log(flow.getPreRunString());
    await Connector.init({
            config: flow.config,
            logger,
            BL,
            transformer: require('./utils/bl/resources/transformer'),
            uiTemplates: require('./utils/bl/resources/ui-templates.json'),
            testFlow: flow
        });

    var TaskClasses = createTaskClasses({timeout: 3000}, () => new Backend({signatureList: [], flow}));
    var task = new TaskClasses.Task(flow.taskData);

    try {
        await task.execute();
    } catch (ex) {

    }

    postProcess(flow);
	return flow;
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

    var error = flow.hasError();
    if (!error && !flow.isFinished()) {
        error = `Steps still exist in the flow ${JSON.stringify(flow.getPendingSteps())}`;
    }

    if (error) {
        if(error.stepNumber) {
            console.log("Test status: " + chalk.red(`FAILED (step #${error.stepNumber})`));
        } else {
            console.log("Test status: " + chalk.red(`FAILED: ${error}`));
        }

        testsFlowsErrors.push({ message: error });
    } else {
        console.log("Test status: " + chalk.green(`PASSED`));
    }

    for(var key in require.cache) {
        if(key.indexOf(path.join('SDKTasks', 'utils', 'data')) !== -1)
            delete  require.cache[key];
    }

}

async function start() {
	const argsDef = {
		"--ignore"	: 1,
		"--fix"		: 0
	};

	const args = {};
	for (let i = 2; i < process.argv.length; ++i) {
		let arg = process.argv[i];
		if (argsDef.hasOwnProperty(arg))
			args[arg] = argsDef[arg] ? process.argv[++i] : true;
		else {
			console.error(`Unknown option: ${arg}`);
			process.exit();
			return;
		}
	}

	ignoreFuncs = args["--ignore"] && args["--ignore"].split(",");

    const flows = fs.readdirSync(path.join(__dirname,'./flows/'));

    var enableTests = flows
        .map( f => {
            return {
				name	 : f.split(".json")[0],
				data	 : require(path.join(__dirname, "flows", f)),
				filename : path.join(__dirname, "flows", f)
			};
		})
        .filter( f => !f.data.disable);

    console.log(chalk.yellow(`Total tests flows: ${flows.length}`));
    console.log(chalk.yellow(`Total enabled tests flows: ${enableTests.length}`));
    console.log(chalk.yellow(`------------------------------------------------`));
    console.log(chalk.yellow(`Running tests flows`));

    for (var i = 0 ; i < enableTests.length ; i++) {
        process.env = Object.assign(process.env, enableTests[i].data.envVars);
            console.log("\n" + chalk.yellow(`Running test #${i + 1}: ${enableTests[i].name}`));
            let flow = await runTestFlow(enableTests[i].data, i);
            if (flow.ignoredError) {
                if (args["--fix"]) {
                    console.log("Fixing...");
                    fs.writeFileSync(enableTests[i].filename, JSON.stringify(flow._origData, null, "\t"));
                }
            }

        (Object.keys(enableTests[i].data.envVars || {})).forEach(envVar => (delete process.env[envVar]));
    }

    testAnalyzer.writeReport();
}

(async function runTests() {
    await start();
    if (testsFlowsErrors.length === 0) {
        console.log(chalk.green(`Done`));
    } else {
        console.log(chalk.red(`Done with ${testsFlowsErrors.length} errors`));
//        console.log(chalk.red(`Errors: \n${JSON.stringify(testsFlowsErrors)}`));
    }
    process.exit(0);

})();
