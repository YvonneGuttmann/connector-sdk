const path = require("path");

// validate access token and get org and env name
// var apiUrl = outpost.config.apiUrl + "/catalog/auth/login.json?auth_token=" + outpost.config.accessToken;
// outpost.log("calling API to get org data...");
// outpost.http({ url: apiUrl }, function(err, data, res) {
//   if (err) {
//     outpost.fail("API call to " + apiUrl + " failed with error: " + err);
//     return;
//   }
//   if (res.statusCode !== 200) {
//     outpost.fail("API call to " + apiUrl + " failed with status " + res.statusCode + ": " + data);
//     return;
//   }
//   var info = JSON.parse(data);
//   if (info.success !== true) {
//     outpost.fail("API call to " + apiUrl + " failed. received: " + data);
//     return;
//   }
//   outpost.config.orgName = info.user.org.name;
//   outpost.log("API call to get org data success, org is " + outpost.config.orgName);
//   doConfiguration();
// });

function doConfiguration() {
  outpost.config.name = outpost.config.connectorName;
  outpost.template("config.json.tpl", outpost.config, "config.json", function(err) {
    if (err) {
      return outpost.fail(err);
    }

    let inputs = [`input://file://${path.resolve("./log/connector.log")}`];
    let filters = ["filter://json_fields://"];
    let outputs = [`output://${outpost.config.shipLogsOutput}`];

    var extraFields = `${outpost.config.shipLogsExtraFields || ""},org=${outpost.config.orgName},connector=${connectorName}`;
    outpost.script(
      "logstash",
      {
        inputs: inputs,
        filters: filters,
        outputs: outputs,
        name: outpost.config.connectorName,
        start: outpost.config.shipLogs,
        extraFields: extraFields
      },
      function(err) {
        if (err) {
          return outpost.fail("failed to run logstash configuration: " + err);
        } else {
          outpost.done();
        }
      }
    );
  });
}

doConfiguration();
