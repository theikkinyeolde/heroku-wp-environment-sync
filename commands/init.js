const fs          = require('fs');
const jsonfile    = require('jsonfile');
const co          = require('co');
const cli         = require('heroku-cli-util');
const path        = require('path');
const parseUrl    = require('parse-url');
const library     = require('../library/library.js');

const syncfile              = library.defaultsyncfile;
const synclocalfile         = library.defaultsynclocalfile;
const valid_database_envs   = library.validDatabaseEnvs;

function * run (context, heroku) {
    if(fs.existsSync(syncfile)) {
        return cli.error(`Syncfile already exists.`);
    }

    let package_data = require(path.resolve(__dirname + '/../package.json'));

    cli.log();
    cli.styledHeader("Initializing sync file.");
    cli.log("Let's put some initial data to the syncfile. You can edit it later on.");

    var name = yield cli.prompt("Name of the project");

    var prod_app_valid = false;

    while(!prod_app_valid) {
        var prod_app = yield cli.prompt("App name of the production environment in heroku");

        cli.log(`Validating the production app.`);

        try {
            var app_data = yield yield heroku.get(`/apps/${prod_app}/`);
            prod_app_valid = true;
        } catch(error) {
            console.log("No app with that name.");
        }
    }

    var produrl = yield cli.prompt("Production url");
    var localurl = yield cli.prompt("Localhost url");

    var prod_url_data = parseUrl(produrl);
    var local_url_data = parseUrl(localurl);

    produrl = prod_url_data.resource;

    if(prod_url_data.port) {
        produrl += ':' + prod_url_data.port;
    }

    localurl = local_url_data.resource;

    if(local_url_data.port) {
        localurl += ':' + local_url_data.port;
    }

    var replaces = [];

    cli.log(`Let's see what databases the production has.`);

    var heroku_config_vars = yield heroku.get(`/apps/${prod_app}/config-vars`);

    var has_multiple_databases = false;
    var database_set = false;

    var current_database_env = '';
    var database_envs = [];

    for(let e in valid_database_envs) {
        let db_env = valid_database_envs[e];

        if(heroku_config_vars[db_env]) {
            if(database_set) {
                has_multiple_databases = true;
            } else {
                current_database_env = db_env;
            }

            database_set = true;

            database_envs.push(db_env);
        }
    }

    if(has_multiple_databases) {
        let valid_db_variable = false;

        cli.log(`Well, it seems that you have multiple databases in your heroku app.`);
        cli.log(`Current database env variables found:`);
        for(let e in database_envs) {
            cli.log(`- ${cli.color.green(database_envs[e])}`);
        }
        cli.log(`Type in which database environment variable to use?`);

        while(!valid_db_variable) {
            let db_env_var = yield cli.prompt(`Database env name`);

            if(valid_database_envs.indexOf(db_env_var.toUpperCase()) == -1) {
                cli.log(`That is not a valid db env variable.`);
                continue;
            }

            valid_db_variable = true;

            current_database_env = db_env_var.toUpperCase();
        }
    }

    cli.log(`Using database env variable ${current_database_env}.`);

    replaces.push(["https://" + produrl, 'http://' + localurl]);
    replaces.push(["http://" + produrl, 'http://' + localurl]);
    replaces.push([produrl, localurl]);

    var syncfile_template = {
        "name" : name,
        "defaultsetup" : "local",
        "version" : package_data.version,
        "setups" : [
            {
                "name" : "staging",
                "from" : "production",
                "to"   : "staging"
            },
            {
                "name" : "local",
                "from" : "production",
                "to"   : "localhost"
            }
        ],
        "environments" : [
            {
                "name" : "production",
                "app" : prod_app,
                "db_env" : current_database_env
            },
            {
                "name" : "staging",
                "app" : "",
                "mutable" : true,
                "db_env" : current_database_env,
                "replaces" : [
                    []
                ],
                "scripts" : {
                    "before_sync" : [
                    ],
                    "after_sync" : [
                    ],
                    "before_fetch" : [
                    ],
                    "after_fetch" : [
                    ]
                }
            },
            {
                "name" : "localhost",
                "mutable" : true,
                "replaces" : replaces,
                "options" : [
                    "use_local_db"
                ],
                "scripts" : {
                    "before_sync" : [
                    ],
                    "after_sync" : [
                    ],
                    "before_fetch" : [
                    ],
                    "after_fetch" : [
                    ]
                }
            }
        ]
    };

    fs.writeFile(`${path.resolve('./')}/${syncfile}`, JSON.stringify(syncfile_template, null, 4));

    cli.styledHeader("Syncfile initialized.");
}

module.exports = {
    topic : 'sync',
    command : 'init',
    description : 'Create and syncfile.json in to the folder.',
    help : 'It creates a syncfile for a project.',
    needsAuth: true,
    args : [],
    flags : [],
    run : cli.command(co.wrap(run))
}