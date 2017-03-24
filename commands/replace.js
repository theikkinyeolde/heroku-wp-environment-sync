const cli       = require('heroku-cli-util');
const co        = require('co');
const shell     = require('shelljs');
const tmp       = require('tmp');

const library   = require('../library/library.js');
var cmd         = library.cmd;

function * run (context, heroku) {
    let sync_config = library.getSyncFile();

    if(!sync_config) {
        return sync_config;
    }

    var from = yield library.getEnvironmentObject(context.args.environment, false, heroku, sync_config);

    if(!from) {
        return from;
    }

    let tmp_mysql_db = yield library.getTemporaryDatabaseInfo();

    let from_mysql_auth = library.createMysqlAuthParameters(from.db.host, from.db.user, from.db.password, from.db.database);
    let tmp_mysql_auth = library.createMysqlAuthParameters(tmp_mysql_db.host, tmp_mysql_db.user, tmp_mysql_db.password);

    shell.exec(`mysqladmin ${tmp_mysql_auth} create ${tmp_mysql_db.database}`);

    var tmpfile = tmp.fileSync();

    shell.exec(`mysqldump ${from_mysql_auth} > ${tmpfile.name}`);

    for(let r in from.replaces) {
        let replace_from = from.replaces[r]['from'];
        let replace_to = from.replaces[r]['to'];
        let replace_regexp = (from.replaces[r]['regex'] != undefined) ? from.replaces[r]['regex'] : false;

        let rfroms = [];
        if(typeof(replace_from) == 'object') {
            rfroms = replace_from;
        } else if(typeof(replace_from) == 'string') {
            rfroms = [replace_from];
        }

        for(let rf in rfroms) {
            let current_replace_from = rfroms[rf];

            let replace_exec_command = library.createSearchAndReplaceCommand(current_replace_from, replace_to, tmp_mysql_db, {regexp : replace_regexp});

            let replace_return = shell.exec(replace_exec_command, {silent : silent});

            cmd.log(`Replaced "${cli.color.green(current_replace_from)}" to "${cli.color.green(replace_to)}" with ${cli.color.green(replace_return)} rows replaced.`);
        }
    }

    shell.exec(`mysqldump ${tmp_mysql_auth} ${tmp_mysql_db.database} > ${tmpfile.name}`);

    shell.exec(`mysql ${from_mysql_auth} < ${tmpfile.name}`);

    shell.exec(`mysql ${tmp_mysql_auth} -e "drop database ${tmp_mysql_db.database};"`);
}

module.exports = {
    topic : 'sync',
    command : 'replace',
    description : 'Just run the search and replace.',
    help : 'Run search and replace on a database.',
    needsAuth: true,
    args : [
        {
            name : 'environment',
            description : "The environment which the dump is taken from."
        }
    ],
    flags : [
        {

        }
    ],
    run : cli.command(co.wrap(run))
}