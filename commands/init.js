const fs          = require('fs');
const jsonfile    = require('jsonfile');
const co          = require('co');
const cli         = require('heroku-cli-util');
const path        = require('path');
const library     = require('../library/library.js');

const syncfile        = library.defaultsyncfile;
const synclocalfile   = library.defaultsynclocalfile;

function * run (context, heroku) {

    if(fs.existsSync(syncfile)) {
        return cli.error(`Syncfile already exists.`);
    }

    let package_data = require(path.resolve(__dirname + '/../package.json'));

    cli.log();
    cli.styledHeader("Initializing sync file.");
    cli.log("Let's put some initial data to the syncfile. You can edit it later on.");

    var name = yield cli.prompt("Name of the project");

    var prod_app = yield cli.prompt("App name of the production environment in heroku");

    var produrl = yield cli.prompt("Production url (in the form: www.domain.com)");
    var localurl = yield cli.prompt("Localhost url (in the form: localhost)");

    var replaces = [];

    cli.log(`Let's see what databases the production has.`);

    var heroku_config_vars = yield heroku.get(`/apps/${prod_app}/config-vars`);

    var has_multiple_databases = false;
    var database_set = false;

    var current_database_env = '';
    var database_envs = [];

    var valid_database_envs = ['JAWSDB_URL', 'CLEARDB_DATABASE_URL'];

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

    cli.log(`Using database env variable ${current_database_env}.`);

    if(has_multiple_databases) {
        cli.log(`Well it seems that you have multiple databases in your heroku app.`);
        cli.log(`Current database env variables found:`);
        for(let e in database_envs) {
            cli.log(` - ${database_envs[e]}`);
        }
        cli.log(`Type in which database environment variable to use?`);
        current_database_env = yield cli.prompt(`Database env name:`);
    }

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
                ]
            },
            {
                "name" : "localhost",
                "mutable" : true,
                "replaces" : replaces,
                "options" : [
                    "use_local_db"
                ]
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