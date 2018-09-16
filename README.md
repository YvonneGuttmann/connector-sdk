## Overview

### What is this?

ApproveSimple Connectors are responsible to interface and interact between Capriza Cloud Service and the enterprise source application.
Connectors are responsible for both pulling the data from the source application and for performing updates such as“Approve" on an item in the source application, following an action from the end user.

### Who is this for?

Any developer who wants to connect a source application to Capriza Cloud Service.
In the SDK you will find documents, code sample and tools to develop, configure, test and preview your connector and it's compatibility with Capriza ApproveSimple service.

## Getting Started

### Installing Connector SDK

To install the ApproveSimple Connector SDK use the [npm](http://npmjs.org) package manager for Node.js.
Simply type the following into a terminal window:

```sh
npx @capriza/create-connector sample-connector
```
### Testing the Connector

The SDK installation comes with an internal UI to test the connector functionality.
To launch the Connector UI type the following into a terminal window:

```sh
npm run inspector
```

# Support and Documentation
To further read about Connectors architecture and implementation requirements please refer
to Capriza [Support Site](https://docs.approvesimple.com/docs/sdk).