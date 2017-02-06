const cli           = require('heroku-cli-util');
const co            = require('co');
const jsonfile      = require('jsonfile');
const dburl         = require('parse-db-url');
const dateformat    = require('dateformat');
const path          = require('path');
const fs            = require('fs');
const shell         = require('shelljs');

const library       = require('../library/library.js');
const colorEnv      = library.colorEnv;

var silent = true;

const syncfile  = 'syncfile.json';

function * run (context, heroku) {

    let env, app, environment_config, database, filename_prefix, source;

    if(context.flags['mysql-url']) {
        database = dburl(context.flags['mysql-url']);
        filename_prefix = `${database.database}_`;

        source = cli.color.blue(context.flags['mysql-url']);
    } else if(context.flags['app']) {
        app = context.flags['app'];

        let heroku_config_vars = yield heroku.get(`/apps/${app}/config-vars`);
        let heroku_config = yield heroku.get(`/apps/${app}`);
        database = dburl(library.getDatabaseUrlFromConfig(heroku_config_vars, app, {}));

        filename_prefix = `${app}_`;

        source = cli.color.app(app);
    } else {
        let sync_config = library.getSyncFile(syncfile);

        if(!sync_config) {
            return sync_config;
        }

        env = context.args.environment;

        if(!env)
            return cli.error(`No environment parameter given.`);

        environment_config = library.getEnvironmentConfig(env, sync_config);

        if(!environment_config)
            return environment_config;

        if(!environment_config.app)
            return cli.error(`No app defined in ${cli.color.yellow(env)}.`);

        app = environment_config.app;

        let heroku_config_vars = yield heroku.get(`/apps/${app}/config-vars`);
        let heroku_config = yield heroku.get(`/apps/${app}`);
        database = dburl(library.getDatabaseUrlFromConfig(heroku_config_vars, app, sync_config));

        filename_prefix = `${env}_${app}_`;

        source = colorEnv(env, app);
    }

    if(!library.validateDatabaseObject(database))
        return;

    let filename = filename_prefix + dateformat(new Date(), "dd_mm_yyyy_HH_MM") + `.sql`;

    let location = path.resolve('./') + '/' + filename;

    if(context.flags.file) {
        location = context.flags.file;
    }

    if(fs.existsSync(location)) {
        if(fs.statSync(location).isDirectory()) {
            location = path.resolve(location) + "/" + filename;
        }
    } else {
        let dir = path.resolve(path.dirname(location));

        if(!fs.existsSync(dir)) {
            shell.mkdir('-p', dir);
        }

        location = path.resolve(location);
    }


    cli.log();
    cli.styledHeader("Hey baby, let's make some magic happen.");
    cli.log(`I will take the mysql dump from ${source}.`);
    cli.log(`Then I will save it to this location:`);
    cli.log(`${cli.color.magenta(location)}`);

    if(yield library.confirmPrompt('Are you ok with this?')) {
        cli.log(`Ok, let's start this show!`);
    } else {
        cli.log(`Okay, but you'll be back!`);
        return;
    }

    cli.log();
    cli.styledHeader(`Getting the ${source} database.`);

    shell.exec(`mysqldump -u${database.user} -p${database.password} -h${database.host} ${database.database} > ${location}`, {silent : silent});

    cli.log();
    cli.styledHeader(`It is done now. Bye bye!`);
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
            name : "file",
            char : "f",
            description : "The file to which to dump.",
            hasValue : true
        },
        {
            name : "app",
            char : "a",
            description : "If you just want to take the database dump from an app directly.",
            hasValue : true
        },
        {
            name : "mysql-url",
            char : "mu",
            description : "If you wan't to override the syncfile and use mysql url directly.",
            hasValue : true
        }
    ],
    run : cli.command(co.wrap(run))
}