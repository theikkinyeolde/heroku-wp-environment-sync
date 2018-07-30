'use strict'
const fs              = require('fs');
const cli             = require('heroku-cli-util');
const co              = require('co');
const dburl           = require('parse-db-url');
const shell           = require('shelljs');
const randomstring    = require('randomstring');
const path            = require('path');
const os              = require('os');
const tmp             = require('tmp');

const library         = require('../library/library.js');

const colorEnv        = library.colorEnv;

var sync_config = {};
var run_scripts = true;
var tmp_mysql_db = {};

function * run (context, heroku) {

    library.notify("Starting database sync.");

    library.init({
        show_messages : !context.flags.hide,
        force : context.flags.force,
        verbose : (context.flags.verbose || context.flags['more-verbose']),
        heroku : heroku,
        more_verbose : context.flags['more-verbose']
    });

    let sync_config = library.getSyncFile();

    if(!sync_config) {
        return sync_config;
    }

    if(context.flags['skip-scripts']) {
        run_scripts = false;
    }

    var setup = context.args.setup;

    let use_to_from = false;
    if(context.flags.from != undefined || context.flags.to != undefined) {
        if(context.flags.from == undefined || context.flags.to == undefined) {
            return library.error(`If you are using the --from and --to parameters, you need to specify both.`);
        }

        use_to_from = true;
    }

    if(sync_config.environments == undefined || !sync_config.environments.length) {
        return library.error(`No environments defined, exiting.`);
    }

    if(!use_to_from) {
        if(sync_config.setups == undefined || !sync_config.setups.length) {
            return library.error(`No setups defined, exiting.`);
        }

        if(setup == undefined) {
            library.warn("No setup specified, using the default one.");

            setup = sync_config.defaultsetup;

            if(setup == undefined || !setup.length) {
                return library.error(`No default setup specified and no setup argument given, exiting.`);
            }
        }

        if(setup == undefined || !setup.length) {
            return library.error("No setup specified, exiting.");
        }
    }

    let tmp_mysql_db = yield library.getTemporaryDatabaseInfo();

    if(!tmp_mysql_db) {
        return tmp_mysql_db;
    }

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
        return library.error(`Could not find setup configuration with setup ${setup}.`);
    }

    if(context.flags["no-mutable-checks"]) {
        library.log();
        library.header("Ignoring mutable checks!");
        library.log("You are ignoring mutable checks! This is not advised.");
        library.log("I hope you know what you are doing.");

        if(!(yield library.confirmPrompt("Continue?"))) {
            library.log("Quitting!");
            return;
        }
    }

    var from = yield library.getEnvironmentObject(setup_config.from, false, sync_config);
    var tos = [];

    if(!from) {
        return library.error(`Could not get environment configuration.`);
    }

    if(typeof setup_config.to == 'object') {
        for(let t in setup_config.to) {
            let envconf = yield library.getEnvironmentObject(setup_config.to[t], !context.flags["no-mutable-checks"], sync_config);

            if(envconf)
                tos.push(envconf);
        }
    } else if(typeof setup_config.to == 'string') {
        let envconf = yield library.getEnvironmentObject(setup_config.to, !context.flags["no-mutable-checks"], sync_config);

        if(envconf)
            tos.push(envconf);
    }

    if(!tos.length) {
        return library.error(`Error in the configuration of the destination of the sync.`);
    }

    let envs_string = "";

    for(let t in tos) {
        if(envs_string.length)
            envs_string += ", ";
        envs_string += `${cli.color.yellow(tos[t].name)}`;
    }

    library.noLog(`Syncing from ${colorEnv(from.name, from.app)} to ${envs_string}.`);

    library.log();
    library.header("Let's talk.");
    library.log(`This is what i'm going to do.`);
    library.log(`From ${colorEnv(from.name, from.app)} i'm going to get the database.`);
    library.log(`I'm going to put that database after search and replace to these places:`);

    for(let t in tos) {
        library.log(`- ${colorEnv(tos[t].name, tos[t].app, tos[t].local)}`);
    }

    if(yield library.confirmPrompt(`Are you ok with this?`)) {
        library.log(`Ok! Let's do this!`);
    } else {
        library.log(`No sweat! Some other time then!`);
        return;
    }

    library.log();
    library.header(`Getting the database from ${cli.color.yellow(from.name)}`);

    var tmpfile_name = library.getTemporaryDumpFile();
    var tmpfile_name_cache = library.getTemporaryDumpFile(true, from.name + from.app);

    let additional_mysqldump_parameters = "";

    if(!context.flags['lock-database']) {
        additional_mysqldump_parameters = "--single-transaction --quick";
    }
    additional_mysqldump_parameters += library.getMysqldumpOptionString(from);

    if(run_scripts)
        library.runCommandsByName("before_fetch", from);
    
    let use_cache = (context.flags['use-cache'] == true);

    if(!fs.existsSync(tmpfile_name_cache) && use_cache) {
        use_cache = false;
        library.log(`No stored cache for ${colorEnv(from.name, from.app)}. Fetching from the database.`);
    }

    if(!use_cache) {
        library.log(`Getting the database from ${colorEnv(from.name, from.app)}`);
    
        library.shellExec(`mysqldump ${library.createMysqlAuthParameters(from.db.host, from.db.user, from.db.password)} ${from.db.database} ${additional_mysqldump_parameters} > ${tmpfile_name}`);

        if(library.getUserConfigData("store_cache")) {
            library.shellExec(`cp ${tmpfile_name} ${tmpfile_name_cache}`);
        }
    } else {
        library.log(`Using cached dump from ${colorEnv(from.name, from.app)}.`);
        tmpfile_name = tmpfile_name_cache;
    }
        
    if(run_scripts)
        library.runCommandsByName("after_fetch", from);

    if(context.flags['store-dumps'] && !use_cache) {
        library.shellExec(`cp ${tmpfile_name} ${os.tmpdir()}/heroku_wp_environment_sync_${from.name}.sql`);
    }

    library.log(`Creating a temporary database (${tmp_mysql_db.database}).`);

    let tmp_mysql_auth = library.createMysqlAuthParameters(tmp_mysql_db.host, tmp_mysql_db.user, tmp_mysql_db.password);

    let result = library.shellExec(`mysqladmin ${tmp_mysql_auth} create ${tmp_mysql_db.database}`);

    yield library.addTempDbToHomeList(tmp_mysql_db.database);

    for(let t in tos) {
        library.log();
        library.header(`Syncing ${cli.color.yellow(from.name)}' to '${cli.color.yellow(tos[t].name)}'`);

        if(run_scripts)
            library.runCommandsByName("before_sync", tos[t]);

        library.shellExec(`mysql ${tmp_mysql_auth} ${tmp_mysql_db.database} < ${tmpfile_name}`);

        let to_config = tos[t];
        let to_tmpfile = tmp.fileSync();

        if(!context.flags['no-replace']) {
            for(let r in to_config.replaces) {
                let replace_from = to_config.replaces[r]['from'];
                let replace_to = to_config.replaces[r]['to'];
                let replace_regexp = (to_config.replaces[r]['regex'] != undefined) ? to_config.replaces[r]['regex'] : false;

                let rfroms = [];
                if(typeof(replace_from) == 'object') {
                    rfroms = replace_from;
                } else if(typeof(replace_from) == 'string') {
                    rfroms = [replace_from];
                }

                for(let rf in rfroms) {
                    let current_replace_from = rfroms[rf];

                    let replace_exec_command = library.createSearchAndReplaceCommand(current_replace_from, replace_to, tmp_mysql_db, {regexp : replace_regexp});

                    let replace_return = library.shellExec(replace_exec_command);

                    library.log(`Replaced "${cli.color.green(current_replace_from)}" to "${cli.color.green(replace_to)}" with ${cli.color.green(replace_return)} rows replaced.`);
                }
            }
        }

        library.log(`Pushing the mysql database to ${colorEnv(to_config.name, to_config.app)}.`);

        library.shellExec(`mysqldump ${tmp_mysql_auth} ${tmp_mysql_db.database} ${additional_mysqldump_parameters} > ${to_tmpfile.name}`);

        if(context.flags['store-dumps']) {
            library.shellExec(`cp ${to_tmpfile.name} ${os.tmpdir()}/heroku_wp_environment_sync_${tos[t].name}.sql`);
        }

        let to_mysql_auth = library.createMysqlAuthParameters(tos[t].db.host, tos[t].db.user, tos[t].db.password);

        if(tos[t].backup_before_sync) {
            let location;

            if(to_config.backup_before_sync === true) {
                location = library.createDumpFilename(false, `heroku_wp_${tos[t].name}_`, true);
            } else if(typeof(to_config.backup_before_sync) == 'string') {
                location = library.createDumpFilename(to_config.backup_before_sync, `heroku_wp_${tos[t].name}_`, true);
            }

            library.shellExec(`mysqldump ${to_mysql_auth} ${tos[t].db.database} > ${location}`);
        }

        library.shellExec(`mysql ${to_mysql_auth} ${tos[t].db.database} < ${to_tmpfile.name}`);

        if(run_scripts)
            library.runCommandsByName("after_sync", tos[t]);

        if(tos[t].redis != undefined) {
            library.log("Redis found. Flushing it.");

            library.shellExec(`redis-cli -h ${tos[t].redis.host} -p ${tos[t].redis.port} -a ${tos[t].redis.password} flushall`);
        }
    }

    library.log(`Deleting the temporary databases.`);

    yield library.cleanTempDatabases();

    library.log();
    library.header(`It is done.`);
    library.log("Now go and make sure all is nice and neat.");

    if(context.flags.hide) {
        cli.log("Done.");
    }

    if(context.flags['store-dumps']) {
        library.log();
        library.header(`Dump store locations`);
        library.log(`The dump for ${from.name} is located in: ${os.tmpdir()}/heroku_wp_environment_sync_${from.name}.sql`);
        for(let t in tos) {
            library.log(`The dump for ${tos[t].name} is located in: ${os.tmpdir()}/heroku_wp_environment_sync_${tos[t].name}.sql`);
        }
    }

    if(context.flags['open-browser']) {
        if(from.url) {
            cli.open(from.url);
        }

        for(let t in tos) {
            if(tos[t].url) {
                cli.open(tos[t].url);
            }
        }
    }

    library.notify("Your database sync is ready!", true);
    
    library.endingMessage();
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
            description : "The environment from where to take the database.",
            hasValue : true
        },
        {
            name : "to",
            description : "The destination environment of the sync.",
            hasValue : true
        },
        {
            name : "force",
            char : "f",
            description : "No prompts, just pure execution.",
            hasValue : false
        },
        {
            name : "hide",
            char : 'h',
            description : "Hide all log texts.",
            hasValue : false
        },
        {
            name : "no-mutable-checks",
            description : "Ignore mutable checks. Be careful with this option.",
            hasValue : false
        },
        {
            name : "no-replace",
            char : 'r',
            description : "Skip the search and replace part of the sync.",
            hasValue : false
        },
        {
            name : "lock-database",
            char : 'l',
            description : "Lock the database during the dumping process.",
            hasValue : false
        },
        {
            name : "store-dumps",
            char : 's',
            description : "Store dumps for later use.",
            hasValue : false
        },
        {
            name : "verbose",
            description : "More verbose output. For troubleshooting."
        },
        {
            name : "more-verbose",
            description : "Even more verbose output (commands outputs are shown). For troubleshooting."
        },
        {
            name : 'skip-scripts',
            description : 'Skip the script running part.',
            hasValue : false
        },
        {
            name : 'use-cache',
            description : 'Skip the mysqldump process and use database sql from cache. For situations where fresh database dump isn\'t necessary.',
            hasValue : false
        },
        {
            name : "open-browser",
            description : "Open all affected locations in browser after sync. The \"url\" -parameter must be set in the environment configuration.",
            hasValue : false
        }
    ],
    run : cli.command(co.wrap(run))
}