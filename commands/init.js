var fs = require('fs');
var jsonfile = require('jsonfile');
var co = require('co');
var cli = require('heroku-cli-util');
var path = require('path');

var syncfile = 'syncfile.json';

function * run (context, heroku) {

    if(fs.existsSync(syncfile)) {
        return cli.error(`Syncfile already exists.`);
    }

    var syncfile_template = {
        "name" : "",
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
                "app" : ""
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
                "replaces" : [
                    []
                ],
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