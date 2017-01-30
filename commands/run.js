'use strict'

const fs              = require('fs');
const jsonfile        = require('jsonfile');
const cli             = require('heroku-cli-util');
const co              = require('co');
const dburl           = require('parse-db-url');
const shell           = require('shelljs');
const tmp             = require('tmp');
const dotenv          = require('dotenv');
const randomstring    = require('randomstring');
const path            = require('path');

const syncfile        = 'syncfile.json';
const synclocalfile   = '.synclocal';

var sync_config = {};
var heroku = {};
var silent = true;
var tmp_mysql_db = {};

function confirmPrompt (msg) {
    return co(function * () {
        msg = msg + " (yes)";

        let confirmation = yield cli.prompt(msg);

        confirmation = confirmation.toLowerCase();

        if(confirmation == "yes") {
            return yield Promise.resolve(true);
        } else {
            return yield Promise.resolve(false);
        }
    });
}

function getEnvironmentObject (env, sync_to) {
    return co(function * () {
        if(!getEnvironmentConfig(env)) {
            return cli.error(`No environment with the name ${env} exists.`);
        }

        var output_object = {
            name : env
        };

        var env_name = `${cli.color.yellow(env)}`;

        var config = getEnvironmentConfig(env);

        if(!config) {
            return cli.error(`Did not find environment with the name ${env_name}.`);
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

        if(config.app != undefined) {
            heroku_config_vars = yield heroku.get(`/apps/${config.app}/config-vars`);
            heroku_config = yield heroku.get(`/apps/${config.app}`);
            output_object.db = dburl(getDatabaseUrlFromConfig(heroku_config_vars, config.app));
        } else {
            if(configHasOption(config, "use_local_db")) {
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
            }
        }

        if(output_object.db == undefined) {
            return cli.error(`Could not get the database info for ${env_name}`);
        }

        if(config.app) {
            if(heroku_config_vars.REDIS_URL != undefined) {
                output_object.redis = dburl(heroku_config_vars.REDIS_URL);
            }
        }

        if(config.branch != undefined && config.app != undefined) {
            let figured_remote = true;
            let remote = shell.exec(`git remote -v | grep '${heroku_config.git_url}'`, {silent : silent});

            let add_git = false;
            let remote_name = "";

            if(remote.code != 0) {
                figured_remote = false;
            } else {
                if(!remote.split("\t").length) {
                    figured_remote = false;
                }
            }

            if(figured_remote) {
                remote_name = remote.split("\t")[0];

                if(typeof remote_name == 'string' && remote_name.length) {
                    if(yield confirmPrompt(`Is ${cli.color.magenta(remote_name)} the right remote for ${env_name}`)) {
                        add_git = true;
                    }
                }
            } else {
                cli.log(`Could not figure out the git remote for ${env_name} automatically.`);

                if(yield confirmPrompt(`Do you want to type in the real remote?`)) {
                    remote_name = cli.prompt(`Remote name`);
                    add_git = true;
                }
            }

            if(remote_name.length && add_git) {
                output_object.git = {
                    branch : config.branch,
                    remote : remote_name,
                    url : heroku_config.git_url
                };
            }
        }

        if(config.replaces != undefined && config.replaces.length) {
            output_object.replaces = config.replaces;
        }

        return yield Promise.resolve(output_object);
    });
}

function getEnvironmentConfig (env) {
    for(let c in sync_config.environments) {
        if(!sync_config.environments[c])
            continue;

        if(env == sync_config.environments[c].name) {
            return sync_config.environments[c];
        }
    }
    return false;
}

function getDatabaseUrlFromConfig (config, app) {
    var url = '';

    if(sync_config.db) {
        if(sync_config.db == 'jaws') {
            url = config.JAWSDB_URL;
        } else if(sync_config.db == 'cleardb') {
            url = config.CLEARDB_DATABASE_URL;
        } else {
            return cli.error("Unknown database specified in the sync file.");
        }
    } else if(config.JAWSDB_URL != undefined) {
        url = config.JAWSDB_URL;
    } else if(config.CLEARDB_DATABASE_URL != undefined) {
        url = config.CLEARDB_DATABASE_URL;
    }

    if(url.length == 0) {
        return cli.error(`No database url specified in the ${cli.color.app(app)} -application.`);
    }

    return url;
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

function configHasOption (config, option) {
    if(config.options) {
        for(let o in config.options) {
            if(config.options[o] == option)
                return true;
        }
    }
    return false;
}

function colorEnv (env, app) {
    if(!app)
        return `${cli.color.yellow(env)}`;

    return `${cli.color.yellow(env)} (${cli.color.app(app)})`;
}

function * run (context, h) {
    heroku = h;
    var silent = true;

    if(!fs.existsSync(syncfile)) {
        return cli.error(`Sync file (${syncfile}) does not exist.`);
    }

    var setup = context.args.setup;

    let env_config_file = getEnvDatabaseConfig();

    if(!env_config_file) {
        return cli.error(`Could not get the required fields from the local file.`);
    }

    sync_config = jsonfile.readFileSync(syncfile);

    if(sync_config.environments == undefined || !sync_config.environments.length) {
        return cli.error(`No environments defined, exiting.`);
    }

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

    let random_string_config = {length : 25, charset : 'abcdefghijklmnopqrstuvwxyz'};

    tmp_mysql_db.user   = env_config_file.parsed.DB_USER;
    tmp_mysql_db.pass   = env_config_file.parsed.DB_PASSWORD;
    tmp_mysql_db.host   = env_config_file.parsed.DB_HOST;
    tmp_mysql_db.db     = "heroku_temp_" + randomstring.generate(random_string_config) + randomstring.generate(random_string_config);

    let setup_config = false;

    for(let s in sync_config.setups) {
        if(sync_config.setups[s].name == setup) {
            setup_config = sync_config.setups[s];
            break;
        }
    }

    if(!setup_config) {
        return cli.error(`Could not find setup configuration with setup ${setup}.`);
    }

    var from = yield getEnvironmentObject(setup_config.from);
    var tos = [];

    if(!from) {
        return cli.error(`Could not get environment configuration.`);
    }

    if(typeof setup_config.to == 'object') {
        for(let t in setup_config.to) {
            tos.push(yield getEnvironmentObject(setup_config.to[t]));
        }
    } else  if(typeof setup_config.to == 'string') {
        tos.push(yield getEnvironmentObject(setup_config.to));
    }

    cli.log();
    cli.styledHeader("Let's talk. You and me, baby.");
    cli.log(`This is what i'm going to do.`);
    cli.log(`From ${colorEnv(from.name, from.app)} i'm going to get the database.`);
    cli.log(`I'm going to put that database after search and replace to these places:`);

    var use_git = false;
    for(let t in tos) {

        cli.log(`- ${colorEnv(tos[t].name, tos[t].app)}`);

        if(tos[t].git != undefined) {
            use_git = true;
        }
    }

    if(use_git && !context.flags['no-git']) {
        cli.log("Then i'm going to push these branches to the remotes:");

        for(let t in tos) {
            if(tos[t].git == undefined)
                continue;

            cli.log(`- I'm going to push branch ${cli.color.magenta(tos[t].git.branch)} in to ${colorEnv(tos[t].name, tos[t].app)}.`);
        }
    }

    if(yield confirmPrompt('Are you ok with this?')) {
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

    if(!context.flags['no-git'] && use_git) {
        cli.log();
        cli.styledHeader(`Pushing the git branches.`);

        shell.exec(`git pull`);

        for(let t in tos) {
            if(tos[t].git == undefined)
                continue;

            shell.exec(`git push ${tos[t].git.remote} ${tos[t].git.branch}`);
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
    command : 'run',
    description : 'Run the sync. "syncfile.json" must be created (heroku sync:init).',
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
            name : "no-git",
            char : 'g',
            description : "Do not sync and push git.",
            hasValue : false
        }
    ],
    run : cli.command(co.wrap(run))
}