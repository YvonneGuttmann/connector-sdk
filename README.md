# Connector for Service Now
This connector uses the  [Service Now REST API](https://developer.servicenow.com/app.do#!/rest_api_doc?v=kingston&id=c_TableAPI "Heading link").

<p align="center">
 <img src="https://github.com/capriza/ServiceNow-Connector/blob/master/screenshots/servicerequest.jpeg" width="20%">
</p>

To test this connector, you can create a free [DEMO account](https://www.servicenow.com/lpdem/demonow.html) by adding (or creating) your demo system credentials.

The repository contains an example of [config.json](https://github.com/capriza/ServiceNow-Connector/blob/master/resources/config.json),  [transformer.js](https://github.com/capriza/ServiceNow-Connector/blob/master/resources/transformer.js) and [ui-templates.json](https://github.com/capriza/ServiceNow-Connector/blob/master/resources/ui-templates.json) for the [change request](https://docs.servicenow.com/bundle/kingston-it-service-management/page/product/change-management/task/t_CreateAChange.html) and [service request](https://docs.servicenow.com/bundle/jakarta-it-service-management/page/product/service-catalog-management/concept/c_ServiceCatalogManagement.html?title=Service_Catalog_Management#gsc.tab=0) use cases.

For more info about creating Capriza Connectors and the files mentioned above, see: [Capriza Connector SDK](https://github.com/capriza/connector-sdk)

For more info about how Capriza Connectors are created and configured, see: Capriza Connector SDK (github) and [Capriza Connector SDK - Connector Creation Steps](https://docs.approvesimple.com/v1.2/docs/connector-creation-steps-general)

## Getting Started

Follow these instructions to download and configure a Capriza connector for development and testing purposes.

### Download and configure the service-now-connector package

1. From the folder in which the connector folder should be located, run the following command on your terminal:

```
npx @capriza/service-now-connector 
```

The service-now-connector folder is created.

2. Add your service-now credentials to the [systemConfig.json](https://github.com/capriza/ServiceNow-Connector/blob/master/resources/systemConfig.json) file. If you don't have a service-now account, you can create one at [demo](https://www.servicenow.com/lpdem/demonow.html).

Example of system.json before editing:

````javascript
{
	"instanceName": "YOUR_INSTANCE",
	"integrationUser": {
		"username": "admin",
		"password": "ADMIN_PASSWORD"
	}
}
````

### Install Connector and Run Test Tool

1. From the service-now-connector folder, run the command: 

```
npm install
```


2. Run the command below to start the Capriza test tool (inspector):

```
npm run inspector
```

Open  [http://localhost:8080/](http://localhost:8080/) in your browser.

## How does the connector work?

#### The connector uses 2 types of requests - GET and PUT:

Get requests can be used for fetching single approval requests or all open approval requests. Get requests are also used for fetching attachments. 

Put requests are used for registering actions such as approve and reject.  Paragraphs 1, 2 and 3 below illustrate how the service-now connector uses these GET and PUT requests.
                
 1. The connector uses a request of type GET to retrieve approval request data. For details": [click here](https://developer.servicenow.com/app.do#!/rest_api_doc?v=kingston&id=r_TableAPI-GET).

The example below shows how approval request data for a single approval request with "0349403adba52200a6a2b31be0b8f509" is fetched:
`GET  https://dev36661.service-now.com/api/now/table/sysapproval_approver, params = {"sysparm_query":"sys_id=0349403adba52200a6a2b31be0b8f509^state=requested"}`

The next example fetches approval request data for all pending approval requests:
`GET  https://dev36661.service-now.com/api/now/table/sysapproval_approver, params = {"sysparm_query":"state=requested^source_table=change_request","sysparm_fields":"approver.sys_id,approver.name,approver.user_name","sysparm_limit":1000}`

2. GET requests are also used to fetch attachment data. For more details, [click here](https://developer.servicenow.com/app.do#!/rest_api_doc?v=kingston&id=r_AttachmentAPI-GET).
Here is an example of using a GET request to fetch all the attachments from a table named sysapproval_approver table:
`GET  https://dev36661.service-now.com/api/now/attachment, params = {"sysparm_query":"table_name=sysapproval_approver"}`

3. PUT requests are used to modify the table data following approve and reject actions. The service-now connector uses PUT requests to modify the "state" key when any action is taken, and the "comments" key when a reject reason or comment was provided by the user. For more details [click here](https://developer.servicenow.com/app.do#!/rest_api_doc?v=kingston&id=r_TableAPI-PUT).

Here is an example of updating the table data when the user has taken an approve action for approval request id ="00e9c07adba52200a6a2b31be0b8f5ae":
`PUT  https://dev36661.service-now.com/api/now/table/sysapproval_approver/00e9c07adba52200a6a2b31be0b8f5ae, data = {"state":"approved"}`
                

#### The utils.js file contains 3 methods that wrap the service-now requests:

- `snGet(instanceName, username, password, api,tableName, params, logger)`

- `snPut(instanceName, username, password, api, tableName, sysId, data, logger)`

- `downloadUrlAttachment(username, password, url, mediaType, logger)`


## config file (resources/config.json):

### Config.json defines three mandatory parameters and several optional parameters:
###### 1. `tableName` -> The name of the table from which approvals are fetched e.g: sysapproval_approver, sc_ic_aprvl_type_defn_staging etc...The value should not be changed because it should be the name of the table in which all the approvals exist.

###### 2. `useCaseNames` -> This array of objects should contain the use cases your connector will treat, for example: change_request, std_change_proposal, sc_req_item etc.. 

Each useCaseNames object has (at minimum) these 2 properties: name(String) and sourceTable(Boolean). The name property is most, the default value of sourceTable is true. if you set sourceTable to false then it means that you use in usecase that doesn't have 'regular' source table (this use for customize tables in the system).
###### 3. `useCaseLabels` -> object of key(usecase name) value (array of Strings), the array value include **the fields you want the connector will fetch**, pay attention, you can ask from x levels of tables. e.g: state, sys_id, document_id.number, document_id.conflict_status etc.
###### 4. Optional param: `additionalTables` -> If you want to add extra data from different table that not relate to the tableName above, e.g: conflict table. Pay attention, you also need to add your useCaseLabels (just like you add in the main tableName). You can add several tables (it's array, see example below).
###### 5. Optional param: `maxApprovals` - number for maximum approvals to fetch.
###### 6. Optional param: `delegate` - if that flag is on, the connector will also check if exist delegate approvals in the system (that relevant to the current date) - if exist the connector will duplicate the approvals to the approver delegate.
###### 7. Optional param: `maxConcurrentRequests` - In order to avoid overloading the SN server, we limit the maximum number of requests from the connector. It is advisable not to give too high value. A default value is 10. use it of you get 429 
###### 8. Optional param: `optimizedFetch` - This is for optimized the fetch (instead of fetch all the pending approvals, it scan the last modified approvals and fetch only the changes. the default fetched is optimized if you want to avoid optimized logic - set it to false)
###### 9. Optional param: `actionByScript` - For case you want to approve/reject by using remotely script on your system. 
 
 for using other use cases(service request, requested item, catalog task, change task etc...), you need to add the usecase name in the [config.json](https://github.com/capriza/ServiceNow-Connector/blob/master/resources/config.json), and add the data to:  [transformer.js](https://github.com/capriza/ServiceNow-Connector/blob/master/resources/transformer.js) and [ui-templates.json](https://github.com/capriza/ServiceNow-Connector/blob/master/resources/ui-templates.json).

````javascript
{
  "caprizaConfig": "resources/caprizaConfig.json",
  "systemConfig": "resources/systemConfig.json",
  "controllerConfig": {},
  "blConfig": {
    "tableName": "SOME_TABLE_NAME",
    "useCaseName": "ARRAY_OF_APPROVALS_USE_CASE",
    "useCaseLabels": "ARRAY_OF_LABELS_THAT_WILL_BE_RETURNED",
    "additionalTables": "IF_YOU_WANT_TO_ADD_MORE_TABLES"
	"additionalTables": "IF_YOU_WANT_TO_ADD_MORE_TABLES"
  }
}
````

Example of config file:

````javascript
{
  "caprizaConfig": "resources/caprizaConfig.json",
  "systemConfig": "resources/systemConfig.json",
  "controllerConfig": {},
  "blConfig": {
    "approvalsTable": "sysapproval_approver",
    "useCaseNames": [
      {
        "name": "sc_request",
        "sourceTable": true
      },
      {
        "name": "change_request",
        "sourceTable": true
      }
    ],
    "useCaseFields": {
      "sc_request": [
        "sys_updated_on",
        "document_id.sys_class_name",
        "sys_id",
        "document_id.sys_id",
        "approver.email",
        "approver.name",
        "approver.sys_id",
        "sysapproval.number",
        "document_id.price",
        "document_id.requested_for.name",
        "document_id.priority",
        "comments",
        "document_id.description",
        "document_id.short_description",
        "document_id.opened_by.name",
        "document_id.due_date",
        "document_id.opened_at",
        "document_id.cmdb_ci.name"
      ],
      "change_request": [
        "sys_updated_on",
        "document_id.sys_class_name",
        "sys_id",
        "document_id.sys_id",
        "approver.email",
        "approver.name",
        "approver.sys_id",
        "sysapproval.number",
        "document_id.cmdb_ci.name",
        "document_id.requested_by.name",
        "document_id.priority",
        "document_id.short_description",
        "document_id.state",
        "document_id.risk",
        "document_id.impact",
        "document_id.start_date",
        "document_id.end_date",
        "document_id.description",
        "document_id.category",
        "document_id.assignment_group.name",
        "document_id.assigned_to.name",
        "document_id.justification",
        "document_id.implementation_plan",
        "document_id.risk_impact_analysis",
        "document_id.backout_plan",
        "document_id.test_plan",
        "comments"
      ]
    },
    "additionalTables": {
      "Request": [
        {
          "tableName": "sc_req_item",
          "primaryKey": "request",
          "useCaseLabels": [
            "price",
            "quantity",
            "sys_created_on",
            "impact",
            "active",
            "priority",
            "short_description",
            "comments",
            "due_date",
            "assigned_to",
            "cat_item.name"
          ]
        }
      ],
      "Change Request": [
        {
          "tableName": "conflict",
          "primaryKey": "change",
          "useCaseLabels": [
            "change.number",
            "change.cmdb_ci.name",
            "type",
            "schedule.name",
            "conflicting_change",
            "last_checked"
          ]
        }
      ]
    },
    "actionStateMap": {
      "approved": "Approved",
      "rejected": "Rejected"
    },
    "actionByScript": {
      "baseApiPath": "YOUR_PATH_SCRIPT_URL",
      "httpMethod": "POST/GET/PUT/DELETE",
      "body": {
        "params": {
          "approvalRecId": null,
          "userId": null,
          "comments": null,
          "action": null
        }
      }
    },
    "actionByScript": false,
    "maxApprovals": 1000,
    "maxConcurrentRequests": 50,
    "delegate": true,
    "optimizedFetch": true
  }
}
````





