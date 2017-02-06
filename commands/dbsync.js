'use strict'
const fs              = require('fs');
const cli             = require('heroku-cli-util');
const co              = require('co');
const dburl           = require('parse-db-url');
const shell           = require('shelljs');
const tmp             = require('tmp');
const dotenv          = require('dotenv');
const randomstring    = require('randomstring');
const path            = require('path');

const library         = require('../library/library.js');
const colorEnv        = library.colorEnv;

const syncfile        = 'syncfile.json';
const synclocalfile   = '.synclocal';

var sync_config = {};
var heroku = {};
var silent = true;
var tmp_mysql_db = {};

function getEnvironmentObject (env, sync_to) {
    return co(function * () {
        var output_object = {
            name : env
        };

        var env_name = `${cli.color.yellow(env)}`;

        var config = library.getEnvironmentConfig(env, sync_config);

        if(!config) {
            return config;
        }

        if(config.app != undefined) {
            env_name = colorEnv(env, config.app);
            output_object.app = config.app;
        }

        if(sync_to) {
            if(config.mutable == undefined || !config.mutable) {
                return cli.error(`Can not sync to the environment ${env_name}. It is not mutable.`);
            }
        }

        let heroku_config, heroku_config_vars;

        if(config.app != undefined && config.app != '') {
            heroku_config_vars = yield heroku.get(`/apps/${config.app}/config-vars`);
            heroku_config = yield heroku.get(`/apps/${config.app}`);
            output_object.db = dburl(library.getDatabaseUrlFromConfig(heroku_config_vars, config.app, sync_config));
        } else if(library.configHasOption(config, "use_local_db")){
            let env_config = getEnvDatabaseConfig();

            let pass = '';
            if(env_config.parsed.DB_PASS) {
                pass = env_config.parsed.DB_PASS;
            }

            output_object.db = {
                adapter : "mysql",
                host : env_config.parsed.DB_HOST,
                database : env_config.parsed.DB_NAME,
                user : env_config.parsed.DB_USER,
                pass : pass
            };
        } else {
            return cli.error(`Environment ${cli.color.yellow(env)} doesn't have a app defined, or it isn't a local.`);
        }

        if(output_object.db == undefined) {
            return cli.error(`Could not get the database info for ${env_name}`);
        }

        if(config.app) {
            if(heroku_config_vars.REDIS_URL != undefined) {
                output_object.redis = dburl(heroku_config_vars.REDIS_URL);
            }
        }

        if(config.replaces != undefined && config.replaces.length) {
            output_object.replaces = config.replaces;
        }

        return yield Promise.resolve(output_object);
    });
}

function getEnvDatabaseConfig () {
    let env_config_file = {parsed : {}};
    let synclocal_used = false;

    if(fs.existsSync(synclocalfile)) {
        env_config_file = dotenv.config({
            'path' : './' + synclocalfile
        });

        synclocal_used = true;
    } else if(!fs.existsSync('.env')) {
        return cli.error("Project has no .synclocal or .env file.");
    } else {
        env_config_file = dotenv.config();
    }

    if(env_config_file.parsed.DB_USER == undefined || env_config_file.parsed.DB_HOST == undefined || env_config_file.parsed.DB_PASSWORD == undefined) {
        let file_used = '.env';

        if(synclocal_used)
            file_used = synclocalfile;

        return cli.error(`Oh no! "${file_used}" -file doesn't have required fields (DB_USER, DB_PASSWORD, DB_HOST)!`);
    }

    return env_config_file;
}

function * run (context, h) {
    heroku = h;
    var silent = true;

    sync_config = library.getSyncFile(syncfile);

    if(!sync_config) {
        return sync_config;
    }

    var setup = context.args.setup;

    let use_to_from = false;
    if(context.flags.from != undefined || context.flags.to != undefined) {
        if(context.flags.from == undefined || context.flags.to == undefined) {
            return cli.error(`If you are using the --from and --to parameters, you need to specify both.`);
        }

        use_to_from = true;
    }

    let env_config_file = getEnvDatabaseConfig();

    if(!env_config_file) {
        return cli.error(`Could not get the required fields from the local file.`);
    }

    if(sync_config.environments == undefined || !sync_config.environments.length) {
        return cli.error(`No environments defined, exiting.`);
    }

    if(!use_to_from) {
        if(sync_config.setups == undefined || !sync_config.setups.length) {
            return cli.error(`No setups defined, exiting.`);
        }

        if(setup == undefined) {
            cli.warn("No setup specified, using the default one.");

            setup = sync_config.defaultsetup;

            if(setup == undefined || !setup.length) {
                return cli.error(`No default setup specified and no setup argument given, exiting.`);
            }
        }

        if(setup == undefined || !setup.length) {
            return cli.error("No setup specified, exiting.");
        }
    }

    let random_string_config = {length : 25, charset : 'abcdefghijklmnopqrstuvwxyz'};

    tmp_mysql_db.user   = env_config_file.parsed.DB_USER;
    tmp_mysql_db.pass   = env_config_file.parsed.DB_PASSWORD;
    tmp_mysql_db.host   = env_config_file.parsed.DB_HOST;
    tmp_mysql_db.db     = "heroku_temp_" + randomstring.generate(random_string_config) + randomstring.generate(random_string_config);

    let setup_config = false;

    if(!use_to_from) {
        for(let s in sync_config.setups) {
            if(sync_config.setups[s].name == setup) {
                setup_config = sync_config.setups[s];
                break;
            }
        }
    } else {
        setup_config = {
            'name' : 'tmp',
            'from' : context.flags.from,
            'to'   : context.flags.to
        };
    }

    if(!setup_config) {
        return cli.error(`Could not find setup configuration with setup ${setup}.`);
    }

    var from = yield getEnvironmentObject(setup_config.from, false);
    var tos = [];

    if(!from) {
        return cli.error(`Could not get environment configuration.`);
    }

    if(typeof setup_config.to == 'object') {
        for(let t in setup_config.to) {
            tos.push(yield getEnvironmentObject(setup_config.to[t], true));
        }
    } else  if(typeof setup_config.to == 'string') {
        tos.push(yield getEnvironmentObject(setup_config.to, true));
    }

    cli.log();
    cli.styledHeader("Let's talk. You and me, baby.");
    cli.log(`This is what i'm going to do.`);
    cli.log(`From ${colorEnv(from.name, from.app)} i'm going to get the database.`);
    cli.log(`I'm going to put that database after search and replace to these places:`);

    for(let t in tos) {

        cli.log(`- ${colorEnv(tos[t].name, tos[t].app)}`);

    }

    if(yield library.confirmPrompt('Are you ok with this?')) {
        cli.log(`Ok! Let's do this!`);
    } else {
        cli.log(`No sweat! Some other time then!`);
        return;
    }

    cli.log();
    cli.styledHeader(`Getting the database from ${cli.color.yellow(from.name)}`);

    var tmpfile = tmp.fileSync();

    cli.log(`Getting the database from ${colorEnv(from.name, from.app)}`);

    shell.exec(`mysqldump -u${from.db.user} -p${from.db.password} -h${from.db.host} ${from.db.database} > ${tmpfile.name}`, {silent : silent});

    let mysql_command_auth = `-u${tmp_mysql_db.user} -h${tmp_mysql_db.host} `;

    if(tmp_mysql_db.pass.length) {
        mysql_command_auth += `-p${tmp_mysql_db.pass}`;
    }

    cli.log(`Creating a temporary database.`);

    shell.exec(`mysqladmin ${mysql_command_auth} create ${tmp_mysql_db.db}`);

    process.on('SIGINT', function() {});

    for(let t in tos) {
        cli.log();
        cli.styledHeader(`Syncing ${cli.color.yellow(from.name)}' to '${cli.color.yellow(tos[t].name)}'`);

        shell.exec(`mysql ${mysql_command_auth} ${tmp_mysql_db.db} < ${tmpfile.name}`);

        let to_config = tos[t];
        let to_tmpfile = tmp.fileSync();

        for(let r in to_config.replaces) {
            let replace_from = to_config.replaces[r][0];
            let replace_to = to_config.replaces[r][1];

            let replace_exec_command = `php ${path.resolve(__dirname, "../")}/sar.php --user ${tmp_mysql_db.user} `;

            if(tmp_mysql_db.pass) {
                replace_exec_command += `--pass ${tmp_mysql_db.pass} `;
            }

            replace_exec_command += `--host ${tmp_mysql_db.host} --db ${tmp_mysql_db.db} --replace ${replace_from} --replace-with ${replace_to}`;

            cli.log(`Replacing "${cli.color.green(replace_from)}" to "${cli.color.green(replace_to)}"`);

            shell.exec(replace_exec_command, {silent : silent});
        }

        cli.log(`Pushing the mysql database to ${colorEnv(to_config.name, to_config.app)}.`);

        shell.exec(`mysqldump ${mysql_command_auth} ${tmp_mysql_db.db} > ${to_tmpfile.name}`);

        let to_mysql_auth = `-u${tos[t].db.user} -h${tos[t].db.host} `;

        if(tos[t].db.password)
            to_mysql_auth += `-p${tos[t].db.password}`;

        shell.exec(`mysql ${to_mysql_auth} ${tos[t].db.database} < ${to_tmpfile.name}`, {silent : silent});

        if(tos[t].redis != undefined) {
            cli.log("Redis found. Flushing it.");

            shell.exec(`redis-cli -h ${tos[t].redis.host} -p ${tos[t].redis.port} -a ${tos[t].redis.password} flushall`, {silent : silent});
        }

    }

    cli.log(`Deleting the temporary database.`);
    shell.exec(`mysql ${mysql_command_auth} -e "drop database ${tmp_mysql_db.db};"`);

    cli.log();
    cli.styledHeader(`It is done. Mmmm, that felt good.`);
    cli.log("Now go and make sure all is nice and neat.");
}

module.exports = {
    topic : 'sync',
    command : 'dbsync',
    description : 'Run database sync. "syncfile.json" must be created (heroku sync:init).',
    help : 'It uses the syncfile.json to sync databases.',
    needsAuth: true,
    args : [
        {
            name : 'setup',
            description : 'What setup is used to sync',
            optional : true
        }
    ],
    flags : [
        {
            name : "from",
            char : 'f',
            description : "The sync source environment.",
            hasValue : true
        },
        {
            name : "to",
            char : "t",
            description : "The destination of the sync.",
            hasValue : true
        }
    ],
    run : cli.command(co.wrap(run))
}