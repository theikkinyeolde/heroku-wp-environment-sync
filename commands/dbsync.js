'use strict'
const fs              = require('fs');
const cli             = require('heroku-cli-util');
const co              = require('co');
const dburl           = require('parse-db-url');
const shell           = require('shelljs');
const tmp             = require('tmp');
const randomstring    = require('randomstring');
const path            = require('path');
const os              = require('os');

const library         = require('../library/library.js');

const colorEnv        = library.colorEnv;

var sync_config = {};
var heroku = {};
var silent = true;
var tmp_mysql_db = {};

var cmd = library.cmd;

function runCommands (commands) {
    if(typeof(commands) == undefined)
        return;

    if(typeof(commands) == 'string') {
        if(commands.length == 0)
            return;

        shell.exec(commands, {silent : silent});
    } else if (typeof(commands) == 'object') {
        for(let c in commands) {
            if(commands[c].length == 0)
                continue;

            shell.exec(commands[c], {silent : silent});
        }
    }
}

function getCommandsByName(name, env_config) {
    if(env_config.scripts != undefined) {
        for(let s in env_config.scripts) {
            if(s == name) {
                return env_config.scripts[s];
            }
        }
    }

    return false;
}

function runCommandsByName (name, env_config) {
    let commands = getCommandsByName(name, env_config)

    if(commands != false) {
        return runCommands(commands);
    }

    return false;
}

function * run (context, h) {
    heroku = h;

    let sync_config = library.getSyncFile();

    if(!sync_config) {
        return sync_config;
    }

    if(context.flags['show-command-outputs']) {
        silent = false;
    }

    cmd.setShow(!context.flags.hide);
    cmd.setForce(context.flags.force);

    var setup = context.args.setup;

    let use_to_from = false;
    if(context.flags.from != undefined || context.flags.to != undefined) {
        if(context.flags.from == undefined || context.flags.to == undefined) {
            return cli.error(`If you are using the --from and --to parameters, you need to specify both.`);
        }

        use_to_from = true;
    }

    let env_config_file = yield library.getEnvDatabaseConfig();

    if(!env_config_file) {
        return env_config_file;
    }

    if(sync_config.environments == undefined || !sync_config.environments.length) {
        return cli.error(`No environments defined, exiting.`);
    }

    if(!use_to_from) {
        if(sync_config.setups == undefined || !sync_config.setups.length) {
            return cli.error(`No setups defined, exiting.`);
        }

        if(setup == undefined) {
            cmd.warn("No setup specified, using the default one.");

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

    if(context.flags["no-mutable-checks"]) {
        cmd.log();
        cmd.header("Ignoring mutable checks!");
        cmd.log("You are ignoring mutable checks! This is not advised.");
        cmd.log("I hope you know what you are doing.");

        if(!(yield cmd.confirmPrompt("Continue?"))) {
            cmd.log("Quitting!");
            return;
        }
    }

    var from = yield library.getEnvironmentObject(setup_config.from, false, heroku, sync_config);
    var tos = [];

    if(!from) {
        return cli.error(`Could not get environment configuration.`);
    }

    if(typeof setup_config.to == 'object') {
        for(let t in setup_config.to) {
            let envconf = yield library.getEnvironmentObject(setup_config.to[t], !context.flags["no-mutable-checks"], heroku, sync_config);

            if(envconf)
                tos.push(envconf);
        }
    } else  if(typeof setup_config.to == 'string') {
        let envconf = yield library.getEnvironmentObject(setup_config.to, !context.flags["no-mutable-checks"], heroku, sync_config);

        if(envconf)
            tos.push(envconf);
    }

    if(!tos.length) {
        return cli.error(`Error in the configuration of the destination of the sync.`);
    }

    let envs_string = "";

    for(let t in tos) {
        if(envs_string.length)
            envs_string += ", ";
        envs_string += `${cli.color.yellow(tos[t].name)}`;
    }

    cmd.noLog(`Syncing from ${colorEnv(from.name, from.app)} to ${envs_string}.`);

    cmd.log();
    cmd.header("Let's talk.");
    cmd.log(`This is what i'm going to do.`);
    cmd.log(`From ${colorEnv(from.name, from.app)} i'm going to get the database.`);
    cmd.log(`I'm going to put that database after search and replace to these places:`);

    for(let t in tos) {
        cmd.log(`- ${colorEnv(tos[t].name, tos[t].app)}`);
    }

    if(yield cmd.confirmPrompt(`Are you ok with this?`)) {
        cmd.log(`Ok! Let's do this!`);
    } else {
        cmd.log(`No sweat! Some other time then!`);
        return;
    }

    cmd.log();
    cmd.header(`Getting the database from ${cli.color.yellow(from.name)}`);

    var tmpfile = tmp.fileSync();

    let additional_mysqldump_parameters = "";

    if(!context.flags['lock-database']) {
        additional_mysqldump_parameters = "--single-transaction --quick";
    }

    cmd.log(`Getting the database from ${colorEnv(from.name, from.app)}`);

    runCommandsByName("before_fetch", from);

    shell.exec(`mysqldump -u${from.db.user} -p${from.db.password} -h${from.db.host} ${from.db.database} ${additional_mysqldump_parameters} > ${tmpfile.name}`, {silent : silent});

    runCommandsByName("after_fetch", from);

    if(context.flags['store-dumps']) {
        shell.exec(`cp ${tmpfile.name} ${os.tmpdir()}/heroku_wp_environment_sync_${from.name}.sql`, {silent : silent});
    }

    let mysql_command_auth = `-u${tmp_mysql_db.user} -h${tmp_mysql_db.host} `;

    if(tmp_mysql_db.pass.length) {
        mysql_command_auth += `-p${tmp_mysql_db.pass}`;
    }

    cmd.log(`Creating a temporary database (${tmp_mysql_db.db}).`);

    shell.exec(`mysqladmin ${mysql_command_auth} create ${tmp_mysql_db.db}`, {silent : silent});

    if(shell.error()) {
        return cli.error(`Error connecting to mysql server in host ${cli.color.magenta(tmp_mysql_db.host)}.`);
    }

    process.on('SIGINT', function() {});

    for(let t in tos) {
        cmd.log();
        cmd.header(`Syncing ${cli.color.yellow(from.name)}' to '${cli.color.yellow(tos[t].name)}'`);

        runCommandsByName("before_sync", tos[t]);

        shell.exec(`mysql ${mysql_command_auth} ${tmp_mysql_db.db} < ${tmpfile.name}`, {silent : silent});

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
                    let replace_exec_command = `php ${path.resolve(__dirname, "../")}/sar.php --user ${tmp_mysql_db.user} `;

                    if(tmp_mysql_db.pass) {
                        replace_exec_command += `--pass ${tmp_mysql_db.pass} `;
                    }

                    replace_exec_command += `--host ${tmp_mysql_db.host} --db ${tmp_mysql_db.db} --search "${current_replace_from}" --replace "${replace_to}"`;

                    if(replace_regexp) {
                        replace_exec_command += ` --regexp`;
                    }

                    let replace_return = shell.exec(replace_exec_command, {silent : silent});

                    cmd.log(`Replaced "${cli.color.green(current_replace_from)}" to "${cli.color.green(replace_to)}" with ${cli.color.green(replace_return)} rows replaced.`);
                }
            }
        }

        cmd.log(`Pushing the mysql database to ${colorEnv(to_config.name, to_config.app)}.`);

        shell.exec(`mysqldump ${mysql_command_auth} ${tmp_mysql_db.db} ${additional_mysqldump_parameters} > ${to_tmpfile.name}`, {silent : silent});

        if(context.flags['store-dumps']) {
            shell.exec(`cp ${to_tmpfile.name} ${os.tmpdir()}/heroku_wp_environment_sync_${tos[t].name}.sql`, {silent : silent});
        }

        let to_mysql_auth = `-u${tos[t].db.user} -h${tos[t].db.host} `;

        if(tos[t].db.password)
            to_mysql_auth += `-p${tos[t].db.password}`;

        shell.exec(`mysql ${to_mysql_auth} ${tos[t].db.database} < ${to_tmpfile.name}`, {silent : silent});

        runCommandsByName("after_sync", tos[t]);

        if(tos[t].redis != undefined) {
            cmd.log("Redis found. Flushing it.");

            shell.exec(`redis-cli -h ${tos[t].redis.host} -p ${tos[t].redis.port} -a ${tos[t].redis.password} flushall`, {silent : silent});
        }

    }

    cmd.log(`Deleting the temporary database.`);

    shell.exec(`mysql ${mysql_command_auth} -e "drop database ${tmp_mysql_db.db};"`, {silent : silent});

    cmd.log();
    cmd.header(`It is done.`);
    cmd.log("Now go and make sure all is nice and neat.");

    if(context.flags.hide) {
        cli.log("Done.");
    }

    if(context.flags['store-dumps']) {
        cmd.log();
        cmd.header(`Dump store locations`);
        cmd.log(`The dump for ${from.name} is located in: ${os.tmpdir()}/heroku_wp_environment_sync_${from.name}.sql`);
        for(let t in tos) {
            cmd.log(`The dump for ${tos[t].name} is located in: ${os.tmpdir()}/heroku_wp_environment_sync_${tos[t].name}.sql`);
        }
    }
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
            name : "show-command-outputs",
            char : "c",
            description : "Show command outputs.",
            hasValue : false
        }
    ],
    run : cli.command(co.wrap(run))
}