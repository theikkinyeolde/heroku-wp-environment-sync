const cli           = require('heroku-cli-util');
const dburl         = require('parse-db-url');
const fs            = require('fs');
const co            = require('co');
const dotenv        = require('dotenv');
const semver        = require('semver');
const path          = require('path');
const request       = require('co-request');
const dateformat    = require('dateformat');
const shell         = require('shelljs');
const randomstring  = require('randomstring');

const syncfilename              = 'syncfile';
const synclocalfile             = '.synclocal';
const needed_sync_file_version  = '0.2.3'
const valid_database_envs       = ['JAWSDB_URL', 'CLEARDB_DATABASE_URL'];

function getTemporaryDatabaseInfo () {
    return co(function * () {
        let env_config_file = yield getEnvDatabaseConfig();

        if(!env_config_file) {
            return env_config_file;
        }

        let random_string_config = {length : 25, charset : 'abcdefghijklmnopqrstuvwxyz'};

        let tmp_mysql_db = {
            user : env_config_file.parsed.DB_USER,
            password : env_config_file.parsed.DB_PASSWORD,
            host : env_config_file.parsed.DB_HOST,
            database : "heroku_temp_" + randomstring.generate(random_string_config) + randomstring.generate(random_string_config)
        };

        return tmp_mysql_db;
    });

}

function createMysqlAuthParameters (host, user, pass, database) {
    let output = `-h${host} -u${user}`;

    if(pass) {
        output += ` -p${pass}`;
    }

    if(database) {
        output += ` ${database}`;
    }

    return output;
}

function colorEnv (env, app) {
    if(!app)
        return `${cli.color.yellow(env)}`;

    return `${cli.color.yellow(env)} (${cli.color.app(app)})`;
}

function getEnvironmentObject (env, sync_to, heroku, sync_config) {
    return co(function * () {
        var output_object = {
            name : env
        };

        var env_name = `${cli.color.yellow(env)}`;

        var config = getEnvironmentConfig(env, sync_config);

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
            if(!(yield validateApp(config.app, heroku))) {
                return cli.error(`Environment ${colorEnv(env)} doesn't have a valid app.`);
            }

            heroku_config_vars = yield heroku.get(`/apps/${config.app}/config-vars`);
            heroku_config = yield heroku.get(`/apps/${config.app}`);

            output_object.db = dburl(getDatabaseUrlFromConfig(env, heroku_config_vars, sync_config));

        } else if(configHasOption(config, "use_local_db")){
            let env_config = yield getEnvDatabaseConfig();

            if(!env_config)
                return cli.error(`Could not get local database configuration.`);

            let pass = '';
            if(env_config.parsed.DB_PASSWORD) {
                pass = env_config.parsed.DB_PASSWORD;
            }

            output_object.db = {
                adapter : "mysql",
                host : env_config.parsed.DB_HOST,
                database : env_config.parsed.DB_NAME,
                user : env_config.parsed.DB_USER,
                password : pass
            };
        } else {
            return cli.error(`Environment ${cli.color.yellow(env)} doesn't have a app defined, or it isn't a local.`);
        }

        if(!(yield dbCheck(output_object.db.host, output_object.db.user, output_object.db.password, output_object.db.database))) {
            return cli.error(`Could not access the database of environment ${cli.color.yellow(env)}.`);
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

        if(config.scripts != undefined) {
            output_object.scripts = config.scripts;
        }

        if(config.url != undefined) {
            output_object.url = config.url;
        }

        if(config.backup_before_sync) {
            output_object.backup_before_sync = config.backup_before_sync;
        }

        return yield Promise.resolve(output_object);
    });
}

function validateApp (app, heroku) {
    return co(function * () {
        try {
            let app_data = yield heroku.get(`/apps/${app}/`);
            return yield Promise.resolve(true);
        } catch(error) {
            return yield Promise.resolve(false);
        }
    });
}

function getEnvDatabaseConfig () {
    return co(function * () {
        let env_config_file = {parsed : {}};
        let synclocal_used = false;

        let synclocal_creation_reason = "";

        if(fs.existsSync(synclocalfile)) {
            env_config_file = dotenv.config({
                'path' : './' + synclocalfile
            });

            synclocal_used = true;
        } else if(fs.existsSync(".env")) {
            env_config_file = dotenv.config();
        } else {
            cli.log(`Okay, here's the deal.`);
            cli.log(`Your .env file doesn't exist and you don't seem to have a .synclocal -file.`);

            cli.log();
            cli.log(`So what you need is a local database configuration file.`);

            if(!(yield confirmPrompt(`You wan't to create one?`))) {
                return cli.error(`No local file to use, aborting.`);
            }

            let db_host = yield cli.prompt("DB_HOST (Database host)");
            let db_user = yield cli.prompt("DB_USER (Database username)");
            let db_pass = "";

            if(yield confirmPrompt(`Local database has password?`)) {
                db_pass = yield cli.prompt("DB_PASSWORD (Database password)");
            }

            let db_name = yield cli.prompt("DB_NAME (Database name)");

            fs.writeFileSync(`./${synclocalfile}`, `DB_HOST=${db_host}\nDB_USER=${db_user}\nDB_PASSWORD=${db_pass}\nDB_NAME=${db_name}`);

            env_config_file = dotenv.config({
                'path' : './' + synclocalfile
            });
        }

        if(env_config_file.parsed.DB_USER == undefined || env_config_file.parsed.DB_HOST == undefined || env_config_file.parsed.DB_NAME == undefined) {
            let sync_file_used = ".env";

            if(synclocal_used) {
                sync_file_used = ".synclocal";
            }

            return cli.error(`Your ${sync_file_used} -file doesn't have the required fields (DB_USER, DB_HOST, DB_NAME).`);
        }

        return yield Promise.resolve(env_config_file);
    });
}

function dbCheck (host, user, pass, database) {
    return co(function * () {
        let mysql_auth = `-u${user} -h${host}`;

        if(pass) {
            mysql_auth += ` -p${pass}`;
        }

        shell.exec(`mysql ${mysql_auth} -e 'use ${database}'`, {silent : true});

        if(shell.error()) {
            return yield Promise.resolve(false);
        }

        return yield Promise.resolve(true);
    });
}

function getDatabaseUrlFromConfig (env, heroku_config, sync_config) {

    var env_config = getEnvironmentConfig(env, sync_config);

    if(!env_config.db_env) {
        return cli.error(`No db_env set for the environment ${cli.color.yellow(env)}.`);
    }

    if(!heroku_config[env_config.db_env]) {
        return cli.error(`No heroku env set with the env ${cli.color.red(env_config.db_env)}`);
    }

    return heroku_config[env_config.db_env];
}

function getEnvironmentConfig (env, config) {
    for(let c in config.environments) {
        if(!config.environments[c])
            continue;

        if(env == config.environments[c].name) {
            return config.environments[c];
        }
    }

    return cli.error(`Could not get environment ${cli.color.yellow(env)} from config.`);
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

function getSyncFile () {
    let syncfile = syncfilename + '.js';
    let sync_config = {};

    if(!fs.existsSync(process.cwd() + '/' + syncfile)) {
        syncfile = syncfilename + '.json';

        if(!fs.existsSync(syncfile)) {
            return cli.error(`Sync file (${syncfile}) does not exist.`);
        } else {
            sync_config = JSON.parse(fs.readFileSync(syncfile, 'utf8'));
        }

    } else {
        sync_config = require(process.cwd() + '/' + syncfile);
    }

    if(!sync_config.version || semver.gt(needed_sync_file_version, sync_config.version)) {
        return cli.error(`Your current syncfile seems to be too old. Needed syncfile version ${needed_sync_file_version} and you have ${sync_config.version}. You better initialize the syncfile again.`);
    }

    return sync_config;
}

function validateDatabaseObject (object) {
    if(!object.database || !object.user || !object.host)
        return cli.error(`Database settings given has errors.`);

    return true;
}

var cmd = {
    show : true,
    force : false,

    setShow : function (show) {
        if(show == undefined) {
            show = false;
        }

        this.show = show;
    },

    setForce : function (force) {
        if(force == undefined) {
            force = false;
        }

        this.force = force;
    },

    log : function (msg) {
        if(!this.show)
            return;

        if(!msg)
            msg = "";

        cli.log(msg);
    },

    noLog : function (msg) {
        if(this.show)
            return;

        if(!msg)
            msg = "";

        cli.log(msg);
    },

    debug : function (msg) {
        if(!this.show)
            return;

        if(!msg)
            msg = "";

        cli.debug(msg);
    },

    warn : function (msg) {
        if(!this.show)
            return;

        if(!msg)
            msg = "";

        cli.warn(msg);
    },

    header : function (msg) {
        if(!this.show)
            return;

        if(!msg)
            msg = "";

        cli.styledHeader(msg);
    },

    confirmPrompt : function (msg) {
        if(this.force)
            return co(function * () {
                return yield Promise.resolve(true);
            });

        return co(function * () {
            msg = msg + " (yes)";

            let confirmation = yield cli.prompt(msg);

            confirmation = confirmation.toLowerCase();

            if(confirmation == "yes" ||  confirmation == "y") {
                return yield Promise.resolve(true);
            } else {
                return yield Promise.resolve(false);
            }
        });
    }
}

function confirmPrompt (msg) {
    return co(function * () {
        msg = msg + " (yes)";

        let confirmation = yield cli.prompt(msg);

        confirmation = confirmation.toLowerCase();

        if(confirmation == "yes" || confirmation == "y") {
            return yield Promise.resolve(true);
        } else {
            return yield Promise.resolve(false);
        }
    });
}

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

function createDumpFilename (output, prefix, createdir) {
    let directory = './';

    let filename = prefix + dateformat(new Date(), "dd_mm_yyyy_HH_MM") + `.sql`;

    if(output) {
        if(output[output.length - 1] == '/') {
            directory = output;
        } else {
            filename = path.basename(output);
            directory = path.dirname(output);
        }
    }

    let location = path.resolve(directory) + '/' + filename;

    if(createdir) {
        if(!fs.existsSync(location)) {
            let dir = path.resolve(path.dirname(location));

            if(!fs.existsSync(dir)) {
                shell.mkdir('-p', dir);
            }
        }
    }

    return location;
}

function createSearchAndReplaceCommand (search, replace, dboptions, options) {
    let replace_exec_command = `php ${path.resolve(__dirname, "../")}/sar.php --user ${dboptions.user} `;

    if(dboptions.password != undefined && dboptions.password.length > 0) {
        replace_exec_command += `--pass ${dboptions.password} `;
    }

    replace_exec_command += `--host ${dboptions.host} --db ${dboptions.database} --search "${search}" --replace "${replace}"`;

    if(options.regexp != undefined && options.regexp) {
        replace_exec_command += ` --regexp`;
    }

    return replace_exec_command;
}

module.exports = {
    getDatabaseUrlFromConfig : getDatabaseUrlFromConfig,
    getEnvironmentConfig : getEnvironmentConfig,
    configHasOption : configHasOption,
    getSyncFile : getSyncFile,
    colorEnv : colorEnv,
    cmd : cmd,
    confirmPrompt : confirmPrompt,
    getEnvDatabaseConfig : getEnvDatabaseConfig,
    getEnvironmentObject : getEnvironmentObject,
    validateDatabaseObject : validateDatabaseObject,
    validDatabaseEnvs : valid_database_envs,
    defaultSyncFilename : syncfilename,
    validateApp : validateApp,
    runCommandsByName : runCommandsByName,
    getCommandsByName : getCommandsByName,
    runCommands : runCommands,
    createDumpFilename : createDumpFilename,
    dbCheck : dbCheck,
    createMysqlAuthParameters : createMysqlAuthParameters,
    getTemporaryDatabaseInfo : getTemporaryDatabaseInfo,
    createSearchAndReplaceCommand : createSearchAndReplaceCommand
}