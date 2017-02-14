const cli       = require('heroku-cli-util');
const dburl     = require('parse-db-url');
const fs        = require('fs');
const jsonfile  = require('jsonfile');
const co        = require('co');
const dotenv    = require('dotenv');

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
            output_object.db = dburl(getDatabaseUrlFromConfig(heroku_config_vars, config.app, sync_config));
        } else if(configHasOption(config, "use_local_db")){
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

function getEnvDatabaseConfig (envfile) {
    let env_config_file = {parsed : {}};
    let synclocal_used = false;

    if(fs.existsSync(envfile)) {
        env_config_file = dotenv.config({
            'path' : './' + envfile
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

function getDatabaseUrlFromConfig (config, app, sync_config) {
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
    validateDatabaseObject : validateDatabaseObject
}