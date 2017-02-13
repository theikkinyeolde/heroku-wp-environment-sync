const cli       = require('heroku-cli-util');
const dburl     = require('parse-db-url');
const fs        = require('fs');
const jsonfile  = require('jsonfile');
const co        = require('co');

function colorEnv (env, app) {
    if(!app)
        return `${cli.color.yellow(env)}`;

    return `${cli.color.yellow(env)} (${cli.color.app(app)})`;
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

module.exports = {
    getDatabaseUrlFromConfig : getDatabaseUrlFromConfig,
    getEnvironmentConfig : getEnvironmentConfig,
    configHasOption : configHasOption,
    getSyncFile : getSyncFile,
    colorEnv : colorEnv,
    cmd : cmd,
    validateDatabaseObject : validateDatabaseObject
}