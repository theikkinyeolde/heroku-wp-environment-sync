# heroku-wp-environment-sync

A heroku plugin to sync different wordpress environments. Especially to sync databases, ya hear?

## Requirements

- Heroku cli (https://devcenter.heroku.com/articles/heroku-cli)
- MySql cli
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

Then you need to edit your syncfile.json to correspond the different environments. The search and replaces are defined as followed:
```
"replaces" : [
    ["http://www.domain.com", "http://localhost"],
    ["www.domain.com", "localhost"]
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