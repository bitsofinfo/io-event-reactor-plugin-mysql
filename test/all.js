'use strict'

var util = require('util');
var assert = require('assert');

var mysql = require('mysql');

var EvaluatorUtil = require('../../io-event-reactor/ioReactor').EvaluatorUtil;
var IoEvent = require('../../io-event-reactor-plugin-support').IoEvent;
var IoReactorService = require('../../io-event-reactor');

var logger = function(severity, origin, message) {
    if (severity != 'verbose') {
        console.log(severity + ' ' + origin + ' ' + message);
    }
};

var errorCallback = function(message,error) {
    console.log("ERROR-CALLBACK! " + message + ' ' + error);
};

var connConfig = {
  host     : process.env.mysqlHost,
  user     : process.env.mysqlUser,
  password : process.env.mysqlPw,
  database : process.env.mysqlDb,
  multipleStatements: true
};

console.log(connConfig);

/**
* Generates a IoEventService configuration based around a MockMonitorPlugin and the MysqlReactorPlugin
*
* @param ioEventsReactedTo array that the 'code1' reactor will add IoEvents to it receives as evidence the 'code1' reactor was triggered
* @param evaluatorFunction - evaluator function that will gate the mock IoEvents triggered via 'monitorTriggerConfigs' and let them flow (or not) to the code1 reactor
* @param monitorTriggerConfigs array of MockMonitorPlugin monitorTrigger config objects, these trigger fake IoEvents through the IoReactor frameworks
*/
function generateMockConfig(ioEventsReactedTo, evaluatorFunction, monitorTriggerConfigs) {

    return {
            logFunction: logger,
            errorCallback: errorCallback,

            ioReactors: [

                  {
                      id: "ioReactor-test1",

                      // mock monitor, will trigger mocked IoEvents according to monitorTriggerConfigs
                      monitor: {
                          plugin: "../io-event-reactor/test/mockMonitor",
                          config: {
                              monitorTriggers: monitorTriggerConfigs
                          }
                      },

                      // evaluators, we have one that will gate the fake IoEvents
                      // generated by monitorTriggerConfigs
                      evaluators: [
                          {
                              evaluator: evaluatorFunction,
                              reactors: ['mysql1']
                          }
                      ],

                      // reactors, we have one 'mysql1', inserts
                      // them into the target database
                      reactors: [

                          { id: "mysql1",
                            plugin: "../io-event-reactor-plugin-mysql",
                            config: {
                                  poolConfig : connConfig,

                                  sqlTemplates: [
                                      'INSERT INTO io_event (eventType, fullPath, stats) VALUES("{{{ioEvent.eventType}}}","{{{ioEvent.fullPath}}}","{{{ioEvent.optionalFsStats}}}")'
                                  ],

                                  sqlGenerator: function(ioEvent) {
                                      return [('INSERT INTO io_event (eventType, fullPath, stats) VALUES("'+ioEvent.eventType+'","'+ioEvent.fullPath+'","'+util.inspect(ioEvent.optionalFsStats)+'")')];
                                  },
                              }
                          },
                      ]

                  }

             ]
        };
};



describe('mysql-reactor-test', function() {

    it('Start a mock monitor, validate that a few simple events pass the monitor -> evaluator -> Mysql reactor engine flow', function(done) {

        this.timeout(5000);

        // global array where the code1 reactor will place ioEvents it receives
        var ioEventsReactedTo = [];


        try {
            var connection = mysql.createConnection(connConfig);
            connection.query('DROP TABLE IF EXISTS io_event;' +
                             'CREATE TABLE io_event (`eventType` VARCHAR(256) NOT NULL, `fullPath` VARCHAR(256) NULL,`stats` VARCHAR(512) NULL);',
                function(err, results) {
                    if (err) {
                        done("Error dropping io_event table " + err);
                    }
                });
        } catch(error) {
            done("Error initializing test database and io_event table: " + error);
        }


        var mockConfig = generateMockConfig(ioEventsReactedTo,
                                            EvaluatorUtil.regex(['add','unlink'],'.*testFile\\d+','ig'),
                                                [
                                                    // generate an add, should react to this
                                                    { eventGenerator: function() {
                                                                       return new IoEvent('add','/tmp/testFile1',{size:100},null);
                                                                      },
                                                      timeout: 1000
                                                    },

                                                    // generate an unlink, should react to this
                                                    { eventGenerator: function() {
                                                                       return new IoEvent('unlink','/tmp/testFile1',{size:100},null);
                                                                      },
                                                      timeout: 1000
                                                    },

                                                    // generate an unlinkDir, should not react to this
                                                    { eventGenerator: function() {
                                                                       return new IoEvent('unlinkDir','/tmp/testFile1',{size:100},null);
                                                                      },
                                                      timeout: 1000
                                                    },

                                                    // generate an change for diff file, should not react to this
                                                    { eventGenerator: function() {
                                                                       return new IoEvent('change','/tmp/testFile1',{size:100},null);
                                                                      },
                                                      timeout: 1000
                                                    },

                                                    // generate an add for diff file (letter, not number), should not react to this
                                                    { eventGenerator: function() {
                                                                       return new IoEvent('add','/tmp/testFileA',{size:100},null);
                                                                      },
                                                      timeout: 1000
                                                    },

                                                    // generate an add, should react to this
                                                    { eventGenerator: function() {
                                                                       return new IoEvent('add','/tmp/testFile100',{size:100},null);
                                                                      },
                                                      timeout: 1000
                                                    },
                                                ]);


        // start the reactor
        var reactor = new IoReactorService(mockConfig);

        // check that ioEventsReactedTo contains 3 reaacted to events...
        setTimeout(function(){
            assert.equal(ioEventsReactedTo.length, 3);
            done();
        },3000);

    });

});
