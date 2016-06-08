# io-event-reactor-plugin-mysql

Mysql filesystem event reactor plugin for: [io-event-reactor](https://github.com/bitsofinfo/io-event-reactor)

[![NPM](https://nodei.co/npm/io-event-reactor-plugin-mysql.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/io-event-reactor-plugin-mysql/)

## Usage

To configure this ReactorPlugin in your application that uses [io-event-reactor](https://github.com/bitsofinfo/io-event-reactor) do the following

```
npm install io-event-reactor-plugin-mysql
```

Then in your [io-event-reactor](https://github.com/bitsofinfo/io-event-reactor) configuration object that you pass to the `IoReactorService`
constructor, you can specify this plugin in the `reactors` block as so:

```
var ioReactorServiceConf = {

  ...

  ioReactors: [

          {
              id: "reactor1",

              monitor: {
                  ...
              },

              evaluators: [
                  {
                      evaluator: myEvaluatorFunction,
                      reactors: ['mysql1,...'] // binds mysql to this evaluator
                  }
              ],

              reactors: [

                  // the "id" is what you use to bind this reactor
                  // to an evaluator above
                  { id: "mysql1",
                    plugin: "io-event-reactor-plugin-mysql",

                    config: {

                          // a node-mysql connection pool configuration object:
                          // see: https://github.com/felixge/node-mysql#pool-options
                          //      https://github.com/felixge/node-mysql#connection-options,
                          poolConfig : {
                              host     : 'hostname',
                              user     : 'username',
                              password : 'pw',
                              database : 'dbname',
                              multipleStatements: true
                          },

                          /**
                          * 'sqlTemplates' - an array of mustache (https://github.com/janl/mustache.js) SQL template strings that will be executed
                          *                  in order using node-mysql when this plugin's react() is invoked.
                          *                  (all statements from here and sqlGenerator below exec in a single transaction)
                          *
                          *  Supported mustache template variables that will be made available to you:
                          *    - ioEventType: one of: 'add', 'addDir', 'unlink', 'unlinkDir', 'change'
                          *    - fullPath: string full path to file being reacted to (filename/dir inclusive)
                          *    - parentPath: full path to the directory containing the item manipulated
                          *    - filename: filename/dirname only (no path information)
                          *    - optionalFsStats: optional stats object -> https://nodejs.org/docs/latest/api/fs.html#fs_class_fs_stats
                          *    - optionalExtraInfo: optional object, see the MonitorPlugin you are using to see the spec and when/if its available
                          */
                          sqlTemplates: [
                              'INSERT INTO io_event (eventType,fullPath,stats)      VALUES("{{{ioEvent.eventType}}}","{{{ioEvent.fullPath}}}","{{{ioEvent.optionalFsStats}}}")'
                          ],

                          /**
                          *  - 'sqlGenerator' - callback function(ioEventType, fullPath, optionalFsStats, optionalExtraInfo) that must
                          *                     return an array[] of sql statements literals that will be executed in order using
                          *                     node-mysql when this plugin's react() is invoked.
                          *                     (all statements from here and sqlTemplates above exec in a single transaction)
                          */
                          sqlGenerator: function(ioEvent) {
                              return [('INSERT INTO io_event2 (eventType,fullPath,stats) VALUES("'+ioEvent.eventType+'","'+ioEvent.fullPath+'","'+(ioEvent.optionalFsStats ? ioEvent.optionalFsStats.size : '?') +'")')];
                          },
                      }
                  },

                  ....
              ]
        },
        ....
    ]

    ...
};
```

### Unit tests

To run the unit tests go to the root of the project and run the following. Note the
`username` below should have access to drop/create tables in the target `testDbName`

```
export mysqlHost=[ip/host] mysqlUser=[username] mysqlPw=[pw] mysqlDb=[testDbName]; mocha test/all.js
```
