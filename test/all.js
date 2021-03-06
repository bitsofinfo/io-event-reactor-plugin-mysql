'use strict'

var util = require('util');
var assert = require('assert');

var mysql = require('mysql');

var EvaluatorUtil = require('io-event-reactor/ioReactor').EvaluatorUtil;
var IoEvent = require('io-event-reactor-plugin-support').IoEvent;
var IoReactorService = require('io-event-reactor');

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

/**
* Generates a IoEventService configuration based around a MockMonitorPlugin and the MysqlReactorPlugin
*
* @param evaluatorFunction - evaluator function that will gate the mock IoEvents triggered via 'monitorTriggerConfigs' and let them flow (or not) to the Mysql reactor
* @param monitorTriggerConfigs array of MockMonitorPlugin monitorTrigger config objects, these trigger fake IoEvents through the IoReactor frameworks
*/
function generateMockConfig(evaluatorFunction, monitorTriggerConfigs) {

    return {
            logFunction: logger,
            errorCallback: errorCallback,

            ioReactors: [

                  {
                      id: "ioReactor-test1",

                      // mock monitor, will trigger mocked IoEvents according to monitorTriggerConfigs
                      monitor: {
                          plugin: "io-event-reactor/test/mockMonitor",
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
                            plugin: "../../",
                            config: {
                                  poolConfig : connConfig,

                                  sqlTemplates: [
                                      'INSERT INTO io_event (eventType, fullPath, stats) VALUES("{{{ioEvent.eventType}}}","{{{ioEvent.fullPath}}}","{{{ioEvent.optionalFsStats}}}")'
                                  ],

                                  sqlGenerator: function(ioEvent) {
                                      return [('INSERT INTO io_event2 (eventType, fullPath, stats) VALUES("'+ioEvent.eventType+'","'+ioEvent.fullPath+'","'+util.inspect(ioEvent.optionalFsStats)+'")')];
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

        /**
        * Create both io_event and io_event2 tables for inserts
        * generated by sql template/generator configs above
        */
        var mysqlConnection;
        try {
            mysqlConnection = mysql.createConnection(connConfig);
            mysqlConnection.query('DROP TABLE IF EXISTS io_event;' +
                                  'DROP TABLE IF EXISTS io_event2;' +
                                  'CREATE TABLE io_event (`eventType` VARCHAR(256) NOT NULL, `fullPath` VARCHAR(256) NULL,`stats` VARCHAR(512) NULL);' +
                                  'CREATE TABLE io_event2 (`eventType` VARCHAR(256) NOT NULL, `fullPath` VARCHAR(256) NULL,`stats` VARCHAR(512) NULL);',
                function(err, results) {
                    if (err) {
                        done("Error dropping io_event table " + err);
                    }
                });
        } catch(error) {
            done("Error initializing test database and io_event table: " + error);
        }


        // generate our config, only matching add/unlink events for specific filenames
        var mockConfig = generateMockConfig(EvaluatorUtil.regex(['add','unlink'],'.*testFile\\d+','ig'),
                                                [
                                                    // generate an add, should react to this
                                                    { eventGenerator: function() {
                                                                       return new IoEvent('add','/tmp/testFile1',{size:100},null);
                                                                      },
                                                      timeout: 100
                                                    },

                                                    // generate an unlink, should react to this
                                                    { eventGenerator: function() {
                                                                       return new IoEvent('unlink','/tmp/testFile1',{size:100},null);
                                                                      },
                                                      timeout: 100
                                                    },

                                                    // generate an unlinkDir, should not react to this
                                                    { eventGenerator: function() {
                                                                       return new IoEvent('unlinkDir','/tmp/testFile1',{size:100},null);
                                                                      },
                                                      timeout: 100
                                                    },

                                                    // generate an change for diff file, should not react to this
                                                    { eventGenerator: function() {
                                                                       return new IoEvent('change','/tmp/testFile1',{size:100},null);
                                                                      },
                                                      timeout: 100
                                                    },

                                                    // generate an add for diff file (letter, not number), should not react to this
                                                    { eventGenerator: function() {
                                                                       return new IoEvent('add','/tmp/testFileA',{size:100},null);
                                                                      },
                                                      timeout: 100
                                                    },

                                                    // generate an add, should react to this
                                                    { eventGenerator: function() {
                                                                       return new IoEvent('add','/tmp/testFile100',{size:100},null);
                                                                      },
                                                      timeout: 100
                                                    },
                                                ]);


        // start the reactor
        var reactor = new IoReactorService(mockConfig);

        // check that both tables contains 3 reacted to events...
        setTimeout(function() {

            // for both template generated inserts and generator sql function inserts..
            assertTableData(mysqlConnection,"io_event");
            assertTableData(mysqlConnection,"io_event2");

            done();
        },1000);

    });

});


function assertTableData(mysqlConnection, tableName) {
    mysqlConnection.query('SELECT * from ' + tableName,
        function(err, results) {
            if (err) {
                done("Error selecting from "+tableName+" table " + err);
            }

            assert.equals(results.length,3);
            for (let row of results) {
                assert(row.eventType.indexOf('add') != -1 || row.eventType.indexOf('unlink') != -1);
                assert(row.fullPath.length > 0);
                assert(row.stats.length > 0);
            }
        });
}
