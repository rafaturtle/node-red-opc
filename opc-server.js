/**

 Copyright 2015 Valmet Automation Inc.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 **/

 module.exports = function (RED) {
    "use strict";
    var opcua = require('node-opcua');
    // var path = require('path');
    // var os = require("os");

    function OpcUaServerNode(n) {

        RED.nodes.createNode(this, n);
        var node = this;
        node.status({fill: "orange", shape: "triangle", text: "Ready"});

        this.name = n.name;
        try{
            this.options = JSON.parse(n.options);
        }catch(e){
            node.status({fill: "red", shape: "circle", text: "Error parsing options"});
        }
        var node = this;

        var globalContext = node.context().global;


        function create_server(msg) {

            var port = node.options.port;
            var endpoint = node.options.endpoint;

            if (port > 100000 || port < 1000){
                node.status({fill: "gray", shape: "triangle", text: "Please enter a valid port number"});
                return false;
            }

            if (endpoint==undefined || endpoint.length<1){
                node.status({fill: "gray", shape: "triangle", text: "Please enter a valid endpoint"});
                return false;
            }


            var opcServers = globalContext.get("opcServers") || {};

            var server;

            if (opcServers[port+endpoint])
            {
                server = opcServers[port+endpoint];
                node.status({fill: "green", shape: "dot", text: "Server already existed"});
                node.send(msg);
            }
            else{

                node.log("creating server " + port + " endpoint " + endpoint);

                server = new opcua.OPCUAServer({
                        port: port, // the port of the listening socket of the server
                        resourcePath: endpoint});

                server.buildInfo.productName = node.name.concat("OPC UA server");
                server.buildInfo.buildNumber = "1";
                server.buildInfo.buildDate = new Date();

                node.status({fill: "green", shape: "dot", text: "Server created"});


                server.initialize(function(){
                        node.status({fill: "green", shape: "dot", text: "Server initialized"});

                         msg.payload = {};
                         msg.payload.port = port;
                         msg.payload.endpoint = endpoint;

                         node.send(msg);

                });
            }


             opcServers[port+endpoint] = server;
             globalContext.set("opcServers",opcServers);

            return server;
        }

        function start_server(msg) {
            node.status({fill: "gray", shape: "triangle", text: "Starting server"});

            var server = getServer(msg);

            if (server)
            {
                node.status({fill: "green", shape: "dot", text: "Found server"});

                server.start(function () {
                    node.status({fill: "green", shape: "dot", text: "Server started"});
                    var endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
                    msg.endpointUrl = endpointUrl;

                    node.send(msg);
                });

            }
            else {
                node.status({fill: "gray", shape: "dot", text: "Please chain a server creation"});
                node.error("Please chain a server creation")
            }
        }

        function getServer (msg) {
            var opcServers = globalContext.get("opcServers");
            var server = opcServers[msg.payload.port+msg.payload.endpoint];
            node.log('searching server port '+msg.payload.port+ ' endpoint ' +msg.payload.endpoint);

            return server;
        }

        function add_node(msg){
            var server = getServer(msg);
            var addressSpace = server.engine.addressSpace;


            var name = node.options.name;
            var fqn;

            var parent;

            if (msg.payload.node == undefined || node.options.parent == 'root'){
                  parent = "ObjectsFolder";
                  fqn = name;
            }
            else{
                parent = addressSpace.findNode(msg.payload.node);
                fqn = parent.browseName.name + '.' + name;
            }

            var nodeid = nodeId(fqn,"s");

            var newNode = server.engine.addressSpace.addFolder(parent,
                      { browseName: fqn,
                           nodeId:nodeid});

            msg.payload.node = nodeid;

            node.status({fill: "green", shape: "dot", text: "Node " + nodeid + " created"});

            node.send(msg);
        }

        function nodeId(nodeName,type){
              var nodeid = "ns=1;" + type + "=" + nodeName;
              return nodeid;
        }

        function add_tag(msg){
            var server = getServer(msg);
            var addressSpace = server.engine.addressSpace;
            var name = node.options.name;
            var fqn;
            var parent;

            if (msg.payload.node == undefined || node.options.parent == 'root'){
                  parent = "ObjectsFolder";
                  fqn = name;
            }
            else{
                parent = addressSpace.findNode(msg.payload.node);
                fqn = parent.browseName.name + '.' + name;
            }

            var tagName = node.options.name || msg.payload.name;

            node.log('tagname '+tagName);



            var nodeid;
            var tagType = node.options.type;
            node.log('tagType '+tagType);
            var tagValueObject;
            switch (tagType) {
              case 'Integer':
                nodeid = nodeId(fqn,"s");
                var variableValue = 0;
                tagValueObject = {
                    get: function () {
                        return new opcua.Variant({dataType: opcua.DataType.Integer, value: variableValue });
                    },
                    set: function (variant) {
                        variableValue = parseInt(variant.value);
                        return opcua.StatusCodes.Good;
                    }
                  }
                break;
                case 'Double':
                nodeid = nodeId(fqn,"s");
                var variableValue = 0.0;
                tagValueObject = {
                      get: function () {
                          return new opcua.Variant({dataType: opcua.DataType.Double, value: variableValue });
                      },
                      set: function (variant) {
                          variableValue = parseFloat(variant.value);
                          return opcua.StatusCodes.Good;
                      }
                    }
                  break;
                  default:
                    var variableValue = "";
                    nodeid = nodeId(fqn,"s");
                    tagValueObject = {
                        get: function () {
                            return new opcua.Variant({dataType: opcua.DataType.String, value: variableValue });
                        },
                        set: function (variant) {
                            variableValue = variant.value.toString();
                            return opcua.StatusCodes.Good;
                        }
                      }

            }
            try{

              node.log('nodeid '+nodeid);
              server.engine.addressSpace.addVariable({
                  componentOf: parent,
                  nodeId: nodeid, // some opaque NodeId in namespace 4
                  browseName: tagName,
                  dataType: tagType,
                  value: tagValueObject
              });
              node.status({fill: "green", shape: "dot", text: "Tag " + nodeid + " created"});
            }catch(e){
              node.error(e);
              node.status({fill: "red", shape: "dot", text: "Tag " + nodeid + " not created"});
            }

            msg.payload.tagId = nodeid;
            node.send(msg)
        }

        node.on("input", function (msg) {

            if (node.options.action == "createserver")
                create_server(msg);
            else if (node.options.action == "startserver")
                start_server(msg);
            else if (node.options.action == "addnode")
                add_node(msg);
            else if (node.options.action == "addtag")
                add_tag(msg);

        });


        node.on("close", function () {
            close_server();
        });

        function close_server() {
            if (server) {
                server.shutdown(0, function () {
                });

            }

        }
    }

    RED.nodes.registerType("opc-server", OpcUaServerNode);
};
