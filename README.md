# Capriza Connectors
Backend systems connectors.

##Architecture
The architecture of a connector is composed of several layers - Connector controller, a Business Logic (BL) connector and Drivers that enable technical connection to the backend system.

###Drivers
A Driver is a technical object that provides access the a backend system API.
Examples:

* HTTP - A driver that enables connection to a REST API of a backend system.
* Web Engine - Provides a scripting ability to automatically run the backend system's WEB UI, extract data and perform actions.
* [node-rfc](https://github.com/SAP/node-rfc) - a node based driver that enables connection to SAP rfc functions.

Drivers does not contain business logic, and does not depend on the connector use-case.
Drivers does not have a predefined API.

###Business Logic (BL) Connector
A stateless object that contains the business logic of a one or more use-cases (e.g. expense approval, PO approval).
The *BL connector* may use one or more *Drivers*, to implement the use-case.
The *BL Connector* should implement the following interface:

* **init(options)** - Will be called by the controller connector when the process starts. Meant to allow initialization of the business logic if necessary.
* **fetch(options)** - Connects to the source system, and fetches the data relevant for the use-case(s).
* **getApproval(approval, options)** - Fetches a single **"PENDING"** approval record, given an already fetched approval (for validation comparison). The method should return only ***pending*** approvals, otherwise return null.
* **approve(data, options)** - Performs the approve action in the source system given approval data and the approver credentials (if needed). the *data* input object is assumed to follow this structure {approval, credentials}
* **reject(data, options)** - Performs the reject action in the source system given approval data, the approver credentials (if needed), and a rejection reason (as string). the *data* input object is assumed to follow this structure {approval, credentials, rejectionReason}.
* **downloadAttachment(data, options)** - Downloads the attachment and returns a Uint8Array of binary data.

Important guidelines for the *BL Connector*:

* **Logging** - All of the *BL connector* methods receives "options" parameter that contains ***logger*** property based on pino npm pacakge. 
* **Stateless** - The *BL Connector* should be stateless. Meaning each function from the former list should create a session to the source system, perform the action and then close the session and release any memory that was used.
* **Approval Id** - Both **fetch()** and **getApproval()** functions should return an id field of type string in the *private* section of the approval. This id should uniqly identify the approval in the source system, per approver (In case the same approval can be approved by several approvers, it should be reflected in the id of the approval). In case the "real" source system id of the approval comprises of several fields, these should be added to the private section of the approval (see [*Schema*](https://caprizaportfolio.assembla.com/spaces/capriza-ng/git-7/source))
* **Approver** - Both **fetch()** and **getApproval()** functions should return an approver field of type string in the *private* section of the approval. The approver identifies the approver user of this approval. It should match the mapping of the source user id and the capriza user id.
* **Approvals 'pending' status** - Both **fetch()** and **getApproval()** should return approvals with 'pending' status.

###Connector Controller
The *Connector Controller* is a generic wrapper for each connector that uses a single *BL Connector* to implement one or more use-cases in a specific system, and fulfill the *Backend* tasks:

* **Data transformation** - The data returned from the BL is transformed to comply with the corresponding approval schema. the data transformation is performed using the ***jslt*** npm package that allows to transform one JSON object to another using a JSON "template" that follows the Mongo query langauge. 
* **Sync** - Enables to synchronize 2 different **fetch()** calls in order to determine the difference between those (added, removed, updated). The Sync functionality includes comparison of the list of approvals from the Capriza's backend to the Source System's.
* **Hash** - After each **fetch()** call, the *Connector Controller* Creates an object (approval) signature using a hash function, for easy comparison between approvals, in later syncs. In addition, there is an options to prepare a different hash on partial approval data for the approve/reject actions (under actionSignatureTemplate key in the config).
* **Approve/Reject** - Given an approve/reject task, the *Connector Controller* will first check the validity of the received approval (by using the **getApproval()** function of the *BL Connector*). If the approval is still valid, it will call the **approve/reject** function of the *BL Connector*. Then, it will re-fetch the approval and perform "sync" for that specific approval in order to update the backend with the latest status of this approval.
* **Added Data for each approval** - The Connector Controller extends each approval object with:
    * **id** - A UUID given by the backend to approvals sent (new approvals wouldn't have an id).
    * **syncver** - Sync version represents the version of the record in the backend DB at the time it was send to the connector, it should be returned as is to the backend (new approvals wouldn't have an id).
    * **schemaId** - The data schema id of the approval.
    * **sourceUserId** - Signature (hash) that represents the source system user (based on the "approver" field in the private section of the approval).
    * **signature** - An object with 2 hash results: (1) sync: the hash result (string) of the whole approval object; (2) action: the hash result (string) of the partial approval object that is "sensitive" to change for approve/reject actions (configured in the config using jslt template).
    * **deleted** - An optional flag that would mark an approval as deleted (relevant for sync).
  
    
    Final approval structure (root level): 
        {id, syncver, signature, sourceUserId, schemaId, public, private, [deleted]}

###COM component
Handles the communication with the *Backend* server, Pulls tasks and delegates these to the *Connector Controller*.
              