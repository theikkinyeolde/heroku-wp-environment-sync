const cli           = require('heroku-cli-util');
const co            = require('co');
const dburl         = require('parse-db-url');
const dateformat    = require('dateformat');
const path          = require('path');
const fs            = require('fs');
const shell         = require('shelljs');
const spawn         = require('child_process').spawnSync;

const library       = require('../library/library.js');
const colorEnv      = library.colorEnv;

function * run (context, heroku) {

    library.init({
        show_messages : !context.flags.hide,
        force : context.flags.force,
        verbose : (context.flags.verbose || context.flags['more-verbose']),
        heroku : heroku,
        more_verbose : context.flags['more-verbose']
    });

    let connect_to = "";

    if(context.flags['app']) {
        app = context.flags['app'];

        let heroku_config_vars = yield heroku.get(`/apps/${app}/config-vars`);
        let heroku_config = yield heroku.get(`/apps/${app}`);

        let db_env = yield cli.prompt(`What is the env variable of the database url in the app ${cli.color.app(app)}?`);

        if(!heroku_config_vars[db_env]) {
            return library.error(`No database env variable found with ${cli.color.red(db_env)}.`);
        }

        database = dburl(heroku_config_vars[db_env]);

        connect_to = `${cli.color.app(app)}`;
    } else {
        let sync_config = library.getSyncFile();

        if(!sync_config) {
            return sync_config;
        }

        env = context.args.environment;

        if(!env)
            return cli.error(`No environment parameter given.`);

        environment_config = yield library.getEnvironmentObject(env, false, sync_config);

        if(!environment_config)
            return environment_config;

        app = environment_config.app;

        connect_to = colorEnv(env, app);

        database = environment_config.db;
    }

    library.notify(`Connecting to ${app} -app's database!`);

    library.log();
    library.header(`Connecting to ${connect_to}.`);

    let parameters = [];

    if(database.password)
        parameters.push(`-p${database.password}`);

    parameters.push(`-u${database.user}`);
    parameters.push(`-h${database.host}`);
    parameters.push('-A');
    parameters.push(`${database.database}`);

    var mysql = spawn('mysql', parameters, {stdio : 'inherit'});
}

module.exports = {
    topic : 'sync',
    command : 'connect',
    description : 'Connect to a environment database.',
    help : 'Connect to an environments database using mysql commandline tool.',
    needsAuth: true,
    args : [
        {
            name : 'environment',
            description : "The environment which to connect.",
            optional : true
        }
    ],
    flags : [
        {
            name : "app",
            description : "If you want to connect to an apps database directly.",
            hasValue : true
        },
        {
            name : "verbose",
            description : "More verbose output. For troubleshooting."
        },
        {
            name : "more-verbose",
            description : "Even more verbose output (commands outputs are shown). For troubleshooting."
        }
    ],
    run : cli.command(co.wrap(run))
}