var IoEvent = require('../io-event-reactor-plugin-support').IoEvent;
var ReactorResult = require('../io-event-reactor-plugin-support').ReactorResult;

var util = require('util');
var mysql = require('mysql');
var Mustache = require('mustache');
var fs = require('fs');


class MysqlReactorPlugin {

    /**
    * Constructor
    *
    * An io-event-reactor ReactorPlugin that reacts by executing SQL against a MySql database
    *
    * @param pluginId - identifier for this plugin
    * @param reactorId - id of the IoReactor this Monitor plugin is bound to
    * @param logFunction - a function to be used for logging w/ signature function(severity, origin, message)
    * @param initializedCallback - when this ReactorPlugin is full initialized, this callback  function(reactorPluginId) should be invoked
    *
    * @param pluginConfig - config object that contains the following properties:
    *
    *    - 'poolConfig' - a node-mysql connection pool configuration object: https://github.com/felixge/node-mysql#pool-options, https://github.com/felixge/node-mysql#connection-options,
    *
    *    - one of both of the following (all sql statements generated by the options below are executed in a single transaction)
    *
    *       - 'sqlTemplates' - an array of mustache (https://github.com/janl/mustache.js) SQL template strings that will be executed
    *                              in order using node-mysql when this plugin's react() is invoked. (all statements exec in a single transaction)
    *
    *                             Supported mustache template variables that will be made available to you:
    *                               - ioEventType: one of: 'add', 'addDir', 'unlink', 'unlinkDir', 'change'
    *                               - fullPath: string full path to file being reacted to (filename/dir inclusive)
    *                               - parentPath: full path to the directory containing the item manipulated
    *                               - filename: filename/dirname only (no path information)
    *                               - optionalFsStats: optional stats object -> https://nodejs.org/docs/latest/api/fs.html#fs_class_fs_stats
    *                               - optionalExtraInfo: optional object, see the MonitorPlugin you are using to see the spec and when/if its available
    *
    *       - 'sqlGenerator' - callback function(ioEventType, fullPath, optionalFsStats, optionalExtraInfo) that must
    *                              return an array[] of sql statements literals that will be executed in order using
    *                              node-mysql when this plugin's react() is invoked. (all statements exec in a single transaction)
    */
    constructor(pluginId,
                reactorId,
                logFunction,
                errorCallback,
                initializedCallback,
                pluginConfig) {

        try {
            this._pluginId = pluginId;
            this._reactorId = reactorId;
            this._logFunction = logFunction;
            this._errorCallback = errorCallback;
            this._initializedCallback = initializedCallback;

            // create Mysql Connection pool
            try {
                // construct
                this._mysqlConnection = mysql.createPool(pluginConfig.poolConfig);

            } catch(e) {
                var errMsg = this.__proto__.constructor.name +"["+this._reactorId+"]["+this.getId()+"] error constructing Mysql conn pool: " + e;
                this._log('error',errMsg);
                this._onError(errMsg,e);
            }

            // Handle 'sqlGenerator'
            if (typeof(pluginConfig.sqlGenerator) != 'undefined') {
                this._sqlGenerator = pluginConfig.sqlGenerator;

                // test/validate it
                try {
                    // validate all templates (we will use the stat object from this file itself)
                    fs.stat(__filename, (function(err,stats) {

                        if (err) {
                            throw err;
                        }

                        var ioEvent = new IoEvent('add','/test/full/path/tothing',stats);

                        var output = this._sqlGenerator(ioEvent);
                        this._log('info',"sqlGenerator() function returned test command to exec: " + output);

                    }).bind(this));
                } catch(e) {
                    var errMsg = this.__proto__.constructor.name +"["+this._reactorId+"]["+this.getId()+"] error pre-processing sqlGenerator: " + e;
                    this._log('error',errMsg);
                    this._onError(errMsg,e);
                }
            }


            // Handle 'sqlTemplates', pre-test them all
            if (typeof(pluginConfig.sqlTemplates) != 'undefined') {
                try {
                    this._sqlTemplates = pluginConfig.sqlTemplates;

                    // validate all templates (we will use the stat object from this file itself)
                    fs.stat(__filename, (function(err,stats) {

                        if (err) {
                            throw err;
                        }

                        var ioEvent = new IoEvent('testEventType','/test/full/path/tothing',stats);

                        for (let template of this._sqlTemplates) {
                            try {
                                var output = Mustache.render(template,{'ioEvent':ioEvent});

                                this._log('info',"sqlTemplate["+template+"] rendered to: " + output);

                            } catch(e) {
                                var errMsg = this.__proto__.constructor.name +"["+this._reactorId+"]["+this.getId()+"] error pre-testing Mustache sqlTemplate["+template+"]: " + e;
                                this._log('error',errMsg);
                            }
                        }
                    }).bind(this));
                } catch(e) {
                    var errMsg = this.__proto__.constructor.name +"["+this._reactorId+"]["+this.getId()+"] error pre-processing Mustache sqlTemplates: " + e;
                    this._log('error',errMsg);
                    this._onError(errMsg,e);
                }
            }

            this._initializedCallback(this.getId());

        } catch(e) {
            var errMsg = this.__proto__.constructor.name +"["+this._reactorId+"]["+this.getId()+"] unexpected error: " + e;
            this._log('error',errMsg);
            this._onError(errMsg,e);
        }

    }

    /**
    * getId() - core ReactorPlugin function
    *
    * @return the short name used to bind this reactor plugin to an Evaluator
    */
    getId() {
        return this._pluginId;
    }

    /**
    * react() - core ReactorPlugin function
    *
    * This function is required on ReactorPlugin implementations
    *
    * @param ioEvent - IoEvent object to react to
    * @return Promise - when fulfilled/rejected a ReactorResult object, on error the ReactorResult will contain the error
    *
    */
    react(ioEvent) {
        var self = this;

        return new Promise(function(resolve, reject) {

            self._log('info',"REACT["+self.getId()+"]() invoked: " + ioEvent.eventType + " for: " + ioEvent.fullPath);

            var sqlStatementsToExec = [];

            /**
            * #1 Collect sql statements to exec from SQL templates....
            */
            if (self._sqlTemplates && self._sqlTemplates.length > 0) {

                // for each template, render it and push on to list of commands to exec
                for (let template of self._sqlTemplates) {
                    try {
                        var sqlToExec = Mustache.render(template,{'ioEvent':ioEvent});
                        if (sqlToExec) {
                            sqlStatementsToExec.push(sqlToExec);
                        }
                    } catch(e) {
                        reject(new ReactorResult(false,self.getId(),self._reactorId,ioEvent,
                            "Error generating SQL from mustache template: " + template + " " +  e, e));
                    }
                }
            }

            /**
            * #2 Collection sql statements to exec from SQL generator function
            */
            if (self._sqlGenerator && typeof(self._sqlGenerator) == 'function') {

                try {
                    // generate
                    var generatedSqlStatements = self._sqlGenerator(ioEvent);

                    // concatenate them
                    if (generatedSqlStatements && generatedSqlStatements.length > 0) {
                        sqlStatementsToExec = sqlStatementsToExec.concat(generatedSqlStatements);
                    }

                } catch(e) {
                    reject(new ReactorResult(false,self.getId(),self._reactorId,ioEvent,
                        "Error generating SQL statements from command generator function: " + e, e));
                }
            }

            /**
            * #3 Exec all sql statements!
            */
            self._mysqlConnection.getConnection(function(err, connection) {

                connection.beginTransaction(function(err) {

                    if (err) {
                        reject(new ReactorResult(false,self.getId(),self._reactorId,ioEvent,"Error starting transaction: " + error, error));
                    }

                    for (let sql of sqlStatementsToExec) {
                        connection.query(sql, function(err, result) {
                            if (err) {
                                return connection.rollback(function() {
                                    reject(new ReactorResult(false,self.getId(),self._reactorId,ioEvent,"Error executing SQL: " + error, error));
                                });
                            }
                        });
                    }

                    connection.commit(function(err) {
                        if (err) {
                            return connection.rollback(function() {
                                reject(new ReactorResult(false,self.getId(),self._reactorId,ioEvent,"Error committing SQL: " + error, error));
                            });
                        }
                        resolve(new ReactorResult(true,self.getId(),self._reactorId,ioEvent,"Executed SQL statements successfully"));
                    });

                });
            });
        });


    }

    /**
    *  Helper log function
    *  will set origin = this class' name
    */
    _log(severity,message) {
        this._logFunction(severity,(this.__proto__.constructor.name + '[' + this._reactorId + ']['+this.getId()+']'),message);
    }

    /**
    *  Helper error function
    */
    _onError(errorMessage, error) {
        this._errorCallback(errorMessage, error);
    }

}

module.exports = MysqlReactorPlugin;
