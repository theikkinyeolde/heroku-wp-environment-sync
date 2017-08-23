const fs          = require('fs');
const co          = require('co');
const cli         = require('heroku-cli-util');
const path        = require('path');
const parseUrl    = require('parse-url');
const esc_regex   = require('escape-string-regexp');
const valid_url   = require('valid-url');
const library     = require('../library/library.js');

const valid_database_envs   = library.validDatabaseEnvs;

function * run (context, heroku) {
    library.init({
        verbose : (context.flags.verbose || context.flags['more-verbose']),
        heroku : heroku,
        more_verbose : context.flags['more-verbose']
    });

    if(fs.existsSync(library.default_sync_filename + '.json') || fs.existsSync(library.default_sync_filename + '.js')) {
        return cli.error(`Syncfile already exists.`);
    }

    let package_data = require(path.resolve(__dirname + '/../package.json'));

    library.log();
    library.header("Initializing sync file.");
    library.log("Let's put some initial data to the syncfile. You can edit it later on.");

    var name = yield cli.prompt("Name of the project");

    var prod_app_valid = false;

    while(!prod_app_valid) {
        var prod_app = yield cli.prompt("App name of the production environment in heroku");

        library.log(`Validating the production app.`);

        var app_validation_result = yield library.validateApp(prod_app);
        
        if(app_validation_result === true) {
            prod_app_valid = true;
        } else {
            if(app_validation_result !== true && app_validation_result) {
                if(app_validation_result.id == "not_found") {
                    library.error(`App ${prod_app} seems to not exist.`);
                } else if(app_validation_result.id == "unauthorized" || app_validation_result.id == "forbidden") {
                    library.error(`Seems like you don't have the right access to the app ${prod_app}.`);
                } else {
                    console.log(app_validation_result);
                    library.error(`App ${prod_app} doesn't seem to be a valid app.`);
                }
            } else {
                library.error("No app with that name.");
            }
        }
    }

    var produrl = "";
    var localurl = "";

    while(!valid_url.isUri(produrl)) {
        produrl = yield cli.prompt("Production url (e.g. http://www.domain.com)");

        if(!valid_url.isUri(produrl)) {
            library.error(`${produrl} is not a valid url.`);
        }
    }

    while(!valid_url.isUri(localurl)) {
        localurl = yield cli.prompt("Localhost url (e.g. http://localhost:1234)");

        if(!valid_url.isUri(localurl)) {
            library.error(`${localurl} is not a valid url.`);
        }
    }

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

    library.log(`Let's see what databases the production has.`);

    var heroku_config_vars = yield heroku.get(`/apps/${prod_app}/config-vars`);

    var has_multiple_databases = false;
    var database_set = false;

    var current_database_env = '';
    var database_envs = [];

    for(let e in library.valid_database_envs) {
        let db_env = library.valid_database_envs[e];

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

    if(!current_database_env) {
        library.error(`Couldn't find any database environment variable to fill in.`);

        if(!(yield library.confirmPrompt("Do you want to fill it yourself in later?"))) {
            return library.log("No problem, buddy! Exiting...");
        } else {
            library.log("That's the spirit!");
        }
    }

    if(has_multiple_databases) {
        let valid_db_variable = false;

        library.log(`Well, it seems that you have multiple databases in your heroku app.`);
        library.log(`Current database env variables found:`);
        for(let e in database_envs) {
            library.log(`- ${cli.color.green(database_envs[e])}`);
        }
        library.log(`Type in which database environment variable to use?`);

        while(!valid_db_variable) {
            let db_env_var = yield cli.prompt(`Database env name`);

            if(valid_database_envs.indexOf(db_env_var.toUpperCase()) == -1) {
                library.log(`That is not a valid db env variable.`);
                continue;
            }

            valid_db_variable = true;

            current_database_env = db_env_var.toUpperCase();
        }
    }

    if(!current_database_env.length) {
        library.log(`User fills the database variable himself. Respect!`);
    } else {
        library.log(`Using database env variable ${current_database_env}.`);
    }

    replaces.push({
                    "from" : [
                        "https?:\\/\\/" + esc_regex(produrl)
                    ],
                    "to" : "http://" + localurl,
                    "regex" : true
                });

    replaces.push({
                    "from" : [
                        produrl
                    ],
                    "to" : localurl
                });

    var syncfile_template = {
        "name" : name,
        "defaultsetup" : "local",
        "version" : package_data.version,
        "setups" : [
            {
                "name" : "local",
                "from" : "production",
                "to"   : "localhost",
            }
        ],
        "environments" : [
            {
                "name" : "production",
                "app" : prod_app,
                "db_env" : current_database_env,
                "url" : "https://" + produrl
            },
            {
                "name" : "localhost",
                "mutable" : true,
                "replaces" : replaces,
                "url" : "http://" + localurl,
                "scripts" : {
                    "before_sync" : [
                    ],
                    "after_sync" : [
                    ],
                    "before_fetch" : [
                    ],
                    "after_fetch" : [
                    ]
                },
                "options" : [
                    "use_local_db"
                ]
            }
        ]
    };

    fs.writeFileSync(`${path.resolve('./')}/${library.default_sync_filename + '.json'}`, JSON.stringify(syncfile_template, null, 4));

    library.header("Syncfile initialized.");

    library.endingMessage();
}

module.exports = {
    topic : 'sync',
    command : 'init',
    description : 'Create and syncfile.json in to the folder.',
    help : 'It creates a syncfile for a project.',
    needsAuth: true,
    args : [],
    flags : [
        {
            name : "verbose",
            description : "More verbose output. For troubleshooting."
        },
        {
            name : "more-verbose",
            description : "Even more verbose output (commands outputs are shown). For troubleshooting."
        }
    ],
    run : cli.command(co.wrap(run))
}