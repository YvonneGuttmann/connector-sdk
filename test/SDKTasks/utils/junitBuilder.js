var builder = require('junit-report-builder');


module.exports =  class TestAnalyzer{
    constructor(path){
       this.path = path;
    }

    addJunitSuite(testSuiteName, testOutput){
        console.log(`export junit test: ${testSuiteName}`);
        var suite = builder.testSuite().name(testSuiteName);
        for(var i =0; i<testOutput.length; i++){
            if(testOutput[i].failure.status){
                suite.testCase().className(testOutput[i].className).name(testOutput[i].name).failure(testOutput[i].failure.message);
            }else{
                suite.testCase().className(testOutput[i].className).name(testOutput[i].name);
            }
        }
    }

    writeReport(){
        console.log(`write junit report to ${this.path}`);
        builder.writeTo(this.path);
    }
};