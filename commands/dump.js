const cli           = require('heroku-cli-util');
const co            = require('co');
const dburl         = require('parse-db-url');
const path          = require('path');
const fs            = require('fs');
const shell         = require('shelljs');

const library       = require('../library/library.js');
const colorEnv      = library.colorEnv;

var silent = true;

var cmd = library.cmd;

function * run (context, heroku) {
    yield library.checkVersion();

    if(context.flags['show-command-outputs']) {
        silent = false;
    }

    cmd.setShow(!context.flags.hide);
    cmd.setForce(context.flags.force);

    let env, app, environment_config, database, filename_prefix, source;

    if(context.flags['mysql-url']) {
        database = dburl(context.flags['mysql-url']);
        filename_prefix = `${database.database}_`;

        source = cli.color.blue(context.flags['mysql-url']);
    } else if(context.flags['app']) {
        app = context.flags['app'];

        let heroku_config_vars = yield heroku.get(`/apps/${app}/config-vars`);
        let heroku_config = yield heroku.get(`/apps/${app}`);

        let db_env = yield cli.prompt(`What is the env variable of the database url in the app ${cli.color.app(app)}?`);

        if(!heroku_config_vars[db_env]) {
            return cli.error(`No database env variable found with ${cli.color.red(db_env)}.`);
        }

        database = dburl(heroku_config_vars[db_env]);

        filename_prefix = `${app}_`;

        source = cli.color.app(app);
    } else {
        let sync_config = library.getSyncFile();

        if(!sync_config) {
            return sync_config;
        }

        env = context.args.environment;

        if(!env)
            return cli.error(`No environment parameter given.`);

        environment_config = yield library.getEnvironmentObject(env, false, heroku, sync_config);

        if(!environment_config)
            return environment_config;

        app = environment_config.app;

        filename_prefix = `${env}_`;

        if(app)
            filename_prefix += `${app}_`;

        source = colorEnv(env, app);

        database = environment_config.db;
    }

    if(!library.validateDatabaseObject(database))
        return;

    let location = library.generateDumpFilename(context.flags.output, filename_prefix, true);

    cmd.noLog("Dumping database.");

    cmd.log();
    cmd.header("Hello! Let's dump some databases, shall we?");
    cmd.log(`I will take the mysql dump from ${source}.`);
    cmd.log(`Then I will save it to this location:`);
    cmd.log(`${cli.color.magenta(location)}`);

    if(yield cmd.confirmPrompt('Are you ok with this?')) {
        cmd.log(`Ok, let's start this show!`);
    } else {
        cmd.log(`Okay, but you'll be back!`);
        return;
    }

    cmd.log();
    cmd.header(`Getting the ${source} database.`);

    let additional_mysqldump_parameters = "";

    if(!context.flags['lock-database']) {
        additional_mysqldump_parameters = "--single-transaction --quick";
    }

    let dump_cmd = `mysqldump -u${database.user} -h${database.host}`

    if(database.password)
        dump_cmd += ` -p${database.password}`;

    dump_cmd += ` ${database.database} ${additional_mysqldump_parameters} > ${location}`;

    shell.exec(dump_cmd, {silent : silent});

    cmd.log();
    cmd.header(`It is done now. Bye bye!`);

    cmd.noLog("Done.");

}

module.exports = {
    topic : 'sync',
    command : 'dump',
    description : 'Dump database contents.',
    help : 'Dumps contents of an environments database.',
    needsAuth: true,
    args : [
        {
            name : 'environment',
            description : "The environment which the dump is taken from.",
            optional : true
        }
    ],
    flags : [
        {
            name : "output",
            char : 'o',
            description : "The file or directory to which to dump.",
            hasValue : true
        },
        {
            name : "app",
            description : "If you just want to take the database dump from an app directly.",
            hasValue : true
        },
        {
            name : "mysql-url",
            description : "If you wan't to override the syncfile and use mysql url directly.",
            hasValue : true
        },
        {
            name : "force",
            char : "f",
            description : "Yes to all prompts.",
            hasValue : false
        },
        {
            name : "hide",
            char : 'h',
            description : "Hide all log texts.",
            hasValue : false
        },
        {
            name : "lock-database",
            char : 'l',
            description : "Lock the database during the dumping process.",
            hasValue : false
        },
        {
            name : "show-command-outputs",
            char : "c",
            description : "Show command outputs.",
            hasValue : false
        }
    ],
    run : cli.command(co.wrap(run))
}