const fs          = require('fs');
const jsonfile    = require('jsonfile');
const co          = require('co');
const cli         = require('heroku-cli-util');
const path        = require('path');
const library     = require('../library/library.js');

var syncfile = 'syncfile.json';

function * run (context, heroku) {

    if(fs.existsSync(syncfile)) {
        return cli.error(`Syncfile already exists.`);
    }

    cli.log();
    cli.styledHeader("Initializing sync file.");
    cli.log("Let's put some initial data to the syncfile. You can edit it later on.");

    var name = yield cli.prompt("Name of the project");

    var prod_app = yield cli.prompt("App of the production environment in heroku");

    var produrl = yield cli.prompt("Production url (e.g. www.domain.com)");
    var localurl = yield cli.prompt("Localhost url (e.g. localhost)");

    var is_secure = yield library.confirmPrompt("Is local secure?");

    var replaces = [];

    var local_prefix = "http://";

    if(is_secure) {
        local_prefix = "https://";
    }

    replaces.push(["https://" + produrl, local_prefix + localurl]);
    replaces.push(["http://" + produrl, local_prefix + localurl]);
    replaces.push([produrl, localurl]);

    var syncfile_template = {
        "name" : name,
        "defaultsetup" : "local",
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
                "app" : prod_app
            },
            {
                "name" : "staging",
                "app" : "",
                "mutable" : true,
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