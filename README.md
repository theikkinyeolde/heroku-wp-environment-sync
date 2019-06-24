# heroku-wp-environment-sync

A heroku plugin to sync different wordpress environments. Especially to sync databases, ya hear?

## Requirements

- Heroku cli (https://devcenter.heroku.com/articles/heroku-cli)
- MySQL command line client (also mysqldump)
- WP CLI

## Installation

Installing the plugin is done by running this command:
```
heroku plugins:install heroku-wp-environment-sync
```

## Usage

First you need to create syncfile.js in your project folder. You can create one from a template by running this command:

```
heroku sync:init [production-app-name] [staging-app-name]
```

The different environments are created for you in the beginning, but you can also create new ones in the syncfile.js `environments` -object.


### Syncing

To sync, you must specify the name of the setup so the plugin can get the information needed.

```
heroku sync:dbsync [setup-name]
```

You can also use --to and --from to specify locations, bypassing the setups entirely.
```
heroku sync:dbsync --from from_environment_name --to to_environment_name
```

### Dumping

To dump a database from an environment in the syncfile, use:
```
heroku sync:dump [environment-name]
```

### Help

You can get more information about different commands with the help command.
For example:

```
heroku help sync:dbsync
```

## Changelog

### 0.5.0 / 26.2.2019
* Rewrote the whole plugin to use the new oclif -framework that heroku cli nowaday uses. Many of the features were removed in the process. These are going to come back gradually if need for them rises.

### 0.3.1 / 4.9.2017
* Added dump caching for situations where fresh database dump doesn't matter. You can utilize earlier dump by using the ```--use-cache``` -flag.
* Added user configurations for future user specific configurations. For starters, you can modify if the script stores cache.

### 0.3.0 / 23.8.2017
* Fixes to bugs conserning initialize and other stuff.
* More notifications.

### 0.2.9 / 8.8.2017
* Made changes to the library structure and refactored a bunch of stuff for the future.
* Made error reporting more useful and added verbose mode and more-verbose mode for debugging uses.
* Removed "show-command-outputs" -flag, because of the verbose additions.
* Added notifications so that if you don't respond to a question in about 1 minute, it will notify you in case you forgot.
* Added a new feature for cleaning up databases, that creates a home directory (~/.heroku-wp-environment-sync) and a temp database -file in there, that holds the temporary database names for later cleanup. This is useful for example if you exit the process before the cleanup happens, we can clean up the temporary database later.
* Other bug fixes and changes.