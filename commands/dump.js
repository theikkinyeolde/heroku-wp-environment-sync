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

var cmd = library.cmd;

const syncfile  = 'syncfile.json';

function * run (context, heroku) {

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

        environment_config = yield library.getEnvironmentObject(env, false, heroku);

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

    let dump_cmd = `mysqldump -u${database.user} -h${database.host}`

    if(database.password)
        dump_cmd += ` -p${database.password}`;

    dump_cmd += ` ${database.database} > ${location}`;

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
            name : "file",
            description : "The file to which to dump.",
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
            description : "Hide all log texts.",
            hasValue : false
        }
    ],
    run : cli.command(co.wrap(run))
}