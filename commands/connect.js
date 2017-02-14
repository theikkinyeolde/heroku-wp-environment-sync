const cli           = require('heroku-cli-util');
const co            = require('co');
const jsonfile      = require('jsonfile');
const dburl         = require('parse-db-url');
const dateformat    = require('dateformat');
const path          = require('path');
const fs            = require('fs');
const shell         = require('shelljs');
const spawn         = require('child_process').spawn;

const library       = require('../library/library.js');
const colorEnv      = library.colorEnv;

var silent = true;

var cmd = library.cmd;

const syncfile  = 'syncfile.json';

function * run (context, heroku) {
    let connect_to = "";

    if(context.flags['app']) {
        app = context.flags['app'];

        let heroku_config_vars = yield heroku.get(`/apps/${app}/config-vars`);
        let heroku_config = yield heroku.get(`/apps/${app}`);
        database = dburl(library.getDatabaseUrlFromConfig(heroku_config_vars, app, {}));

        connect_to = `${cli.color.app(app)}`;
    } else {
        let sync_config = library.getSyncFile(syncfile);

        if(!sync_config) {
            return sync_config;
        }

        env = context.args.environment;

        if(!env)
            return cli.error(`No environment parameter given.`);

        environment_config = yield library.getEnvironmentObject(env, false, heroku);

        if(!environment_config)
            return environment_config;

        app = environment_config.app;

        connect_to = colorEnv(env, app);

        database = environment_config.db;
    }

    cmd.log();
    cmd.header(`Connecting to ${connect_to}.`);

    let parameters = [];

    if(database.password)
        parameters.push(`-p${database.password}`);

    parameters.push(`-u${database.user}`);
    parameters.push(`-h${database.host}`);
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
            description : "If you just want to take the database dump from an app directly.",
            hasValue : true
        }
    ],
    run : cli.command(co.wrap(run))
}