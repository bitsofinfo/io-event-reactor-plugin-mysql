# io-event-reactor-plugin-mysql
Mysql filesystem event reactor plugin for: io-event-reactor https://github.com/bitsofinfo/io-event-reactor

### Unit tests

To run the unit tests go to the root of the project and run the following. Note the
`username` below should have access to drop/create tables in the target `testDbName`

```
export mysqlHost=[ip/host] mysqlUser=[username] mysqlPw=[pw] mysqlDb=[testDbName]; mocha test/all.js
```
