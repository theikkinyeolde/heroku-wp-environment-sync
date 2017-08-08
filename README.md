# heroku-wp-environment-sync

A heroku plugin to sync different wordpress environments. Especially to sync databases, ya hear?

## Requirements

- Heroku cli (https://devcenter.heroku.com/articles/heroku-cli)
- MySQL command line client
- PHP

## Installation

Installing the plugin is done by running this command:
```
heroku plugins:install heroku-wp-environment-sync
```

## Usage

First you need to create syncfile.json in your project folder. You can create one from a template by running this command:
```
heroku sync:init
```

The initialization command will ask you questions and creates a syncfile according to those answers.
The syncfile can (and probably have to) be modified by hand afterwards.

Then you need to edit your syncfile.json to correspond the different environments.
The search and replaces can be added as many as needed and are defined as followed:
```
"replaces" : [
    {
        "from" : [
            "http://www.domain.com",
            "https://www.domain.com"
        ],
        "to" : "http://localhost"
    }
]
```

Every string in the "from" array is changed into the "to" string, so you can funnel multiple urls into one.

You can also use regular expression in the search and replace with the regex -option, like so:
```
"replaces" : [
    {
        "from" : [
            "https?:\\/\\/www\.domain\.com"
        ],
        "to" : "http://localhost",
        "regex" : true
    }
]
```

In the syncfile, you need to set the environments that you can sync to as mutable (unless you have specified the --no-mutable-checks -option).
Like so:
```
{
    "name": "production",
    "app": "production_heroku_app_name"
},
{
    "name": "staging",
    "app": "staging_heroku_app_name",
    "mutable": true
}
```

### Syncing

To sync your default setup (which, if you created the syncfile using heroku sync:init, is the local), use:
```
heroku sync:dbsync
```

If you want to specify the setup, use:
```
heroku sync:dbsync setup_name
```

You can also use --to and --from to specify locations, bypassing the setups entirely.
```
heroku sync:dbsync --from from_environment_name --to to_environment_name
```

### Dumping

To dump a database from an environment in the syncfile, use:
```
heroku sync:dump environment_name
```

You can also specify just a app and bypass the syncfile:
```
heroku sync:dump --app heroku_app_name
```

Or you can just paste a mysql url, like so:
```
heroku sync:dump --mysql-url mysql://test:test@test.com/test_db
```

### Connecting

To connect to a database, simply type:
```
heroku sync:connect environment_name
```

### Help

You can get more information about different commands with the help command.
For example:
```
heroku help sync:dbsync
```

Also for troubleshooting consider using the ```--verbose``` and ```--more-verbose``` -flags.

## Changelog
### 0.2.9 / 8.8.2017
* Made changes to the library structure and refactored a bunch of stuff for the future.
* Made error reporting more useful and added verbose mode and more-verbose mode for debugging uses.
* Removed "show-command-outputs" -flag, because of the verbose additions.
* Added notifications so that if you don't respond to a question in about 1 minute, it will notify you in case you forgot.
* Added a new feature for cleaning up databases, that creates a home directory (~/.heroku-wp-environment-sync) and a temp database -file in there, that holds the temporary database names for later cleanup. This is useful for example if you exit the process before the cleanup happens, we can clean up the temporary database later.
* Other bug fixes and changes.