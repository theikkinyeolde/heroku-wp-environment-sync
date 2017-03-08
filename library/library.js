const cli       = require('heroku-cli-util');
const dburl     = require('parse-db-url');
const fs        = require('fs');
const jsonfile  = require('jsonfile');
const co        = require('co');
const dotenv    = require('dotenv');
const semver    = require('semver');

const syncfile                  = 'syncfile.json';
const synclocalfile             = '.synclocal';
const needed_sync_file_version  = '0.1.7'

function colorEnv (env, app) {
    if(!app)
        return `${cli.color.yellow(env)}`;

    return `${cli.color.yellow(env)} (${cli.color.app(app)})`;
}

function getEnvironmentObject (env, sync_to, heroku) {
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
    return co(function * () {
        let env_config_file = {parsed : {}};
        let synclocal_used = false;

        if(fs.existsSync(synclocalfile)) {
            env_config_file = dotenv.config({
                'path' : './' + synclocalfile
            });

            synclocal_used = true;
        } else if(!fs.existsSync('.env')) {
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

            console.log(env_config_file);

            synclocal_used = true;
        } else {
            env_config_file = dotenv.config();
        }


        if(env_config_file.parsed.DB_USER == undefined || env_config_file.parsed.DB_HOST == undefined || env_config_file.parsed.DB_PASSWORD == undefined) {
            let file_used = '.env';

            if(synclocal_used)
                file_used = synclocalfile;

            return cli.error(`Oh no! "${file_used}" -file doesn't have required fields (DB_USER, DB_PASSWORD, DB_HOST)!`);
        }

        return yield Promise.resolve(env_config_file);
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

function getSyncFile (syncfile) {
    if(!fs.existsSync(syncfile)) {
        return cli.error(`Sync file (${syncfile}) does not exist.`);
    }

    sync_config = jsonfile.readFileSync(syncfile);

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

            if(confirmation == "yes") {
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

        if(confirmation == "yes") {
            return yield Promise.resolve(true);
        } else {
            return yield Promise.resolve(false);
        }
    });
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
    defaultsyncfile : syncfile,
    defaultsynclocalfile : synclocalfile
}