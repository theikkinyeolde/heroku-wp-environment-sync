# heroku-wp-environment-sync

A heroku plugin to sync different wordpress environments. Especially to sync databases, ya hear?

## Requirements

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

Then you need to edit your syncfile.json to correspond the different environments. The search and replaces are defined as followed:
```
"replaces" : [
    ["http://www.domain.com", "http://localhost"],
    ["www.domain.com", "localhost"]
]
```

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

In the syncfile, you need to set the environments that you can sync to as mutable.
Like so:
```
{
    "name": "production",
    "app": "production-app"
},
{
    "name": "staging",
    "app": "staging-app",
    "mutable": true
}
```