'use strict'
const cli               = require('heroku-cli-util');
const dburl             = require('parse-db-url');
const fs                = require('fs');
const co                = require('co');
const dotenv            = require('dotenv');
const semver            = require('semver');
const path              = require('path');
const request           = require('co-request');
const dateformat        = require('dateformat');
const shell             = require('shelljs');
const randomstring      = require('randomstring');
const notifier          = require('node-notifier');
const child_process     = require('child_process');
const os                = require('os');
const tmp               = require('tmp');
const crypto            = require('crypto');

const syncfilename              = 'syncfile';
const synclocalfile             = '.synclocal';
const needed_sync_file_version  = '0.2.3'
const valid_database_envs       = ['JAWSDB_URL', 'CLEARDB_DATABASE_URL'];
const home_sync_dir_name        = '.heroku-wp-environment-sync';


function random_range (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function random_array_element (arr) {
    return arr[random_range(0, arr.length - 1)];
}

var lib = {
    //Library initialization variables
    show_messages   : true,
    show_errors     : true,
    verbose         : false,
    force           : false,
    more_verbose   : false,

    heroku          : {},

    //Useful variables
    default_sync_filename : syncfilename,
    valid_database_envs : valid_database_envs,

    //Internal stuff
    max_command_show_length : 70,
    reminder_interval : 65,
    prompts_needs_attention_reminders : [],

    init : function (options) {
        if(options.show_messages) {
            this.show_messages = options.show_messages;
        }

        if(options.show_errors) {
            this.show_errors = options.show_errors;
        }

        if(options.verbose) {
            this.verbose = options.verbose;
        }

        if(options.heroku) {
            this.heroku = options.heroku;
        }

        if(options.force) {
            this.force = options.force;
        }

        if(options.more_verbose) {
            this.more_verbose = options.more_verbose;
        }

        this.checkHerokuHomeDirExists();

    },

    getTemporaryDatabaseInfo : function * () {
        let env_config_file = yield this.getEnvDatabaseConfig();

        if(!env_config_file) {
            return env_config_file;
        }

        let random_string_config = {length : 25, charset : 'abcdefghijklmnopqrstuvwxyz'};

        let tmp_mysql_db = {
            user : env_config_file.parsed.DB_USER,
            password : env_config_file.parsed.DB_PASSWORD,
            host : env_config_file.parsed.DB_HOST,
            database : "heroku_temp_" + randomstring.generate(random_string_config) + randomstring.generate(random_string_config)
        };

        return tmp_mysql_db;
    },

    createMysqlAuthParameters : function (host, user, pass, database) {
        let output = `-h${host} -u${user}`;

        if(pass) {
            output += ` -p${pass}`;
        }

        if(database) {
            output += ` ${database}`;
        }

        return output;
    },

    colorEnv : function (env, app) {
        if(!app)
            return `${cli.color.yellow(env)}`;

        return `${cli.color.yellow(env)} (${cli.color.app(app)})`;
    },

    getEnvironmentObject : function * (env, sync_to, sync_config) {
        this.verboseLog(`Getting the environment data of ${this.colorEnv(env)}.`);

        var output_object = {
            name : env
        };

        var env_name = `${cli.color.yellow(env)}`;

        var config = this.getEnvironmentConfig(env, sync_config);

        if(!config) {
            return config;
        }

        if(config.app != undefined) {
            env_name = this.colorEnv(env, config.app);
            output_object.app = config.app;
        }

        if(sync_to) {
            if(config.mutable == undefined || !config.mutable) {
                return this.error(`Can not sync to the environment ${env_name}. It is not mutable.`);
            }
        }

        let heroku_config, heroku_config_vars;

        if(config.app != undefined && config.app != '') {
            var app_validation_result = yield this.validateApp(config.app);

            if(app_validation_result !== true && app_validation_result) {
                if(app_validation_result.id == "not_found") {
                    return this.error(`Environment ${this.colorEnv(env)} has an app that seems to not exist.`);
                } else if(app_validation_result.id == "unauthorized" || app_validation_result.id == "forbidden") {
                    return this.error(`Environment ${this.colorEnv(env)} has an app that you seem to not have access rights to.`);
                }

                return this.error(`Environment ${this.colorEnv(env)} doesn't have a valid app.`);
            }

            try {
                heroku_config_vars = yield this.heroku.get(`/apps/${config.app}/config-vars`);
                heroku_config = yield this.heroku.get(`/apps/${config.app}`);
            } catch (error) {

                this.error(`Error fetching the configurations of the app ${config.app}.`);
                
                if(this.more_verbose)
                    this.verboseLog(error);
            }
            output_object.db = dburl(this.getDatabaseUrlFromConfig(env, heroku_config_vars, sync_config));

        } else if(this.configHasOption(config, "use_local_db")){
            let env_config = yield this.getEnvDatabaseConfig();

            if(!env_config)
                return this.error(`Could not get local database configuration.`);

            let pass = '';
            if(env_config.parsed.DB_PASSWORD) {
                pass = env_config.parsed.DB_PASSWORD;
            }

            output_object.db = {
                adapter : "mysql",
                host : env_config.parsed.DB_HOST,
                database : env_config.parsed.DB_NAME,
                user : env_config.parsed.DB_USER,
                password : pass
            };
        } else {
            return this.error(`Environment ${cli.color.yellow(env)} doesn't have a app defined, or it isn't a local.`);
        }

        if(!(yield this.dbCheck(output_object.db.host, output_object.db.user, output_object.db.password, output_object.db.database))) {
            return this.error(`Could not access the database of environment ${cli.color.yellow(env)}.`);
        }

        if(output_object.db == undefined) {
            return this.error(`Could not get the database info for ${env_name}`);
        }

        if(config.app) {
            if(heroku_config_vars.REDIS_URL != undefined) {
                output_object.redis = dburl(heroku_config_vars.REDIS_URL);
            }
        }

        if(config.replaces != undefined && config.replaces.length) {
            output_object.replaces = config.replaces;
        }

        if(config.scripts != undefined) {
            output_object.scripts = config.scripts;
        }

        if(config.url != undefined) {
            output_object.url = config.url;
        }

        if(config.backup_before_sync) {
            output_object.backup_before_sync = config.backup_before_sync;
        }

        return yield Promise.resolve(output_object);
    },

    validateApp : function * (app) {

        this.verboseLog(`Checking the validity of app ${app}...`);

        try {
            let app_data = yield this.heroku.get(`/apps/${app}/`);
            
            this.verboseLog(`App seems valid.`);

            return yield Promise.resolve(true);
        } catch(error) {
            if(!error.body) {
                this.verboseLog("App validation error.");
                
                if(this.verbose)
                    this.verboseLog(error);
            } else {
                this.verboseLog("App validation error: " + error.body.message);
            }

            
            return yield Promise.resolve(error.body);
        }
    },

    getEnvDatabaseConfig : function * () {
        this.verboseLog("Getting env database configuration.");

        let env_config_file = {parsed : {}};
        let synclocal_used = false;

        let synclocal_creation_reason = "";

        if(fs.existsSync(synclocalfile)) {
            env_config_file = dotenv.config({
                'path' : './' + synclocalfile
            });

            synclocal_used = true;
        } else if(fs.existsSync(".env")) {
            env_config_file = dotenv.config();
        } else {
            cli.log(`Okay, here's the deal.`);
            cli.log(`Your .env file doesn't exist and you don't seem to have a .synclocal -file.`);

            cli.log();
            cli.log(`So what you need is a local database configuration file.`);

            if(!(yield this.confirmPrompt(`You wan't to create one?`))) {
                return this.error(`No local file to use, aborting.`);
            }

            let db_host = yield cli.prompt("DB_HOST (Database host)");
            let db_user = yield cli.prompt("DB_USER (Database username)");
            let db_pass = "";

            if(yield this.confirmPrompt(`Local database has password?`)) {
                db_pass = yield cli.prompt("DB_PASSWORD (Database password)");
            }

            let db_name = yield cli.prompt("DB_NAME (Database name)");

            fs.writeFileSync(`./${synclocalfile}`, `DB_HOST=${db_host}\nDB_USER=${db_user}\nDB_PASSWORD=${db_pass}\nDB_NAME=${db_name}`);

            env_config_file = dotenv.config({
                'path' : './' + synclocalfile
            });
        }

        this.verboseLog("Checking for necessary local database env variables.");

        if(env_config_file.parsed.DB_USER == undefined || env_config_file.parsed.DB_HOST == undefined || env_config_file.parsed.DB_NAME == undefined) {
            let sync_file_used = ".env";
            
            this.verboseLog("Missing environment variables!");

            if(synclocal_used) {
                sync_file_used = ".synclocal";
            }

            let errors = [];

            if(env_config_file.parsed.DB_USER == undefined) {
                errors.push(`Your ${sync_file_used} -file doesn't have DB_USER set.`);
            }   

            if(env_config_file.parsed.DB_HOST == undefined) {
                errors.push(`Your ${sync_file_used} -file doesn't have DB_HOST set.`);
            }

            if(env_config_file.parsed.DB_NAME == undefined) {
                errors.push(`Your ${sync_file_used} -file doesn't have DB_NAME set.`);
            }

            if(errors.length) {
                for(let e in errors) {
                    this.error(errors[e]);
                }

                return this.error(`Fix these errors and come back, ya hear!?`);
            }
        }

        return yield Promise.resolve(env_config_file);
    },

    dbCheck : function * (host, user, pass, database) {
        this.verboseLog(`Checking database access to ${database}.`);

        let mysql_auth = `-u${user} -h${host}`;

        if(pass) {
            mysql_auth += ` -p${pass}`;
        }
        
        shell.exec(`mysql ${mysql_auth} -e 'use ${database}'`, {silent : true});
    
        if(shell.error()) {
            return yield Promise.resolve(false);
        }

        this.verboseLog(`Database access ok.`);

        return yield Promise.resolve(true);
    },

    getDatabaseUrlFromConfig : function (env, heroku_config, sync_config) {
        var env_config = this.getEnvironmentConfig(env, sync_config);

        if(!env_config.db_env) {
            return this.error(`No db_env set for the environment ${cli.color.yellow(env)}.`);
        }

        if(!heroku_config[env_config.db_env]) {
            return this.error(`No heroku env set with the env ${cli.color.red(env_config.db_env)}`);
        }

        return heroku_config[env_config.db_env];
    },

    getEnvironmentConfig : function (env, config) {
        for(let c in config.environments) {
            if(!config.environments[c])
                continue;

            if(env == config.environments[c].name) {
                return config.environments[c];
            }
        }

        return this.error(`Could not get environment ${cli.color.yellow(env)} from config.`);
    },

    configHasOption : function (config, option) {
        if(config.options) {
            for(let o in config.options) {
                if(config.options[o] == option)
                    return true;
            }
        }
        return false;
    },

    getSyncFile : function () {
        this.verboseLog("Getting syncfile.");

        let syncfile = syncfilename + '.js';
        let sync_config = {};

        if(!fs.existsSync(process.cwd() + '/' + syncfile)) {
            syncfile = syncfilename + '.json';

            if(!fs.existsSync(syncfile)) {
                return this.error(`Sync file (${syncfile}) does not exist.`);
            } else {
                sync_config = JSON.parse(fs.readFileSync(syncfile, 'utf8'));
            }

        } else {
            sync_config = require(process.cwd() + '/' + syncfile);
        }

        if(!sync_config.version || semver.gt(needed_sync_file_version, sync_config.version)) {
            return this.error(`Your current syncfile seems to be too old. Needed syncfile version ${needed_sync_file_version} and you have ${sync_config.version}. You better initialize the syncfile again.`);
        }

        return sync_config;
    },

    getSyncHomeDir : function () {
        return os.homedir() + '/' + home_sync_dir_name;
    },

    checkHerokuHomeDirExists : function () {
        let folder_name = this.getSyncHomeDir();

        if(fs.existsSync(folder_name)) {
            if(!fs.lstatSync(folder_name).isDirectory()) {
                return this.error(`Ok, in your home directory ${home_sync_dir_name} exists, but it is a file.`);
            }
        } else {
            fs.mkdirSync(folder_name);
        }

        this.checkDatabseCacheFolderExists();
    },

    checkDatabseCacheFolderExists : function () {
        var folder_name = this.getSyncHomeDir() + '/cache/';

        if(fs.existsSync(folder_name)) {
            if(!fs.lstatSync(folder_name).isDirectory()) {
                return this.error(`Ok, in your home directory ${home_sync_dir_name}/cache exists, but it is a file.`);
            }
        } else {
            fs.mkdirSync(folder_name);
        }
    },

    addTempDbToHomeList : function * (name) {
        let tmp_databases_file = os.homedir() + '/' + home_sync_dir_name + '/tmp_databases';

        fs.appendFileSync(tmp_databases_file, name + "\n");
    },

    cleanTempDatabases : function * () {
        this.verboseLog("Cleaning up temporary databases.");

        let tmp_databases_file = os.homedir() + '/' + home_sync_dir_name + '/tmp_databases';

        if(!fs.existsSync(tmp_databases_file)) {
            return;
        }

        let tmp_mysql_db = yield this.getTemporaryDatabaseInfo();

        let tmp_mysql_auth = this.createMysqlAuthParameters(tmp_mysql_db.host, tmp_mysql_db.user, tmp_mysql_db.password);

        let contents = fs.readFileSync(tmp_databases_file).toString().split("\n");

        let cleaned_databases = [];
        let not_cleaned_databases = [];

        for(let c in contents) {
            let db_name = contents[c].trim();
            if(db_name.length == 0)
                continue;

            if(!(yield this.dbCheck(tmp_mysql_db.host, tmp_mysql_db.user, tmp_mysql_db.password, db_name)))
                continue;

            this.verboseLog(`Cleaning the database ${db_name}.`);

            this.shellExec(`mysql ${tmp_mysql_auth} -e "drop database ${db_name};"`);

            if(shell.error()) {
                not_cleaned_databases.push(db_name);
                return this.error(`There was an error clearing up the temp databases.`);
            } else {
                cleaned_databases.push(db_name);
            }
        }

        if(cleaned_databases.length) {
            this.verboseLog("Clearing the temporary database list file.");

            fs.writeFileSync(tmp_databases_file, not_cleaned_databases.join("\n"));
        }
    },

    validateDatabaseObject : function (object) {
        if(!object.database || !object.user || !object.host)
            return this.error(`Database settings given has errors.`);

        return true;
    },

    promptReminder : function (parent) {
        if(parent == undefined)
            parent = this;

        let notification_messages = [
            "Hello! Sorry for disturbing, but I need a little attention here. I have a question for you.",
            "Hey, I'm still here... Did you forget about me? I need your input on something to continue!",
            "I really hate to bother you, but I need your input on something to continue!"
        ];

        parent.notify(random_array_element(notification_messages));
    },

    setupAReminder : function () {
        this.prompts_needs_attention_reminders.push(setInterval(this.promptReminder, this.reminder_interval * 1000, this));
    },

    cleanTopReminder : function () {
        clearInterval(this.prompts_needs_attention_reminders.pop());
    },

    confirmPrompt : function * (msg) {
        if(this.force) {
            return yield Promise.resolve(true);
        }

        msg = msg + " (y/n)";

        this.setupAReminder();

        let confirmation = yield cli.prompt(msg);

        this.cleanTopReminder();        

        confirmation = confirmation.toLowerCase();

        if(confirmation == "yes" ||  confirmation == "y") {
            return yield Promise.resolve(true);
        } else {
            return yield Promise.resolve(false);
        }
    },

    prompt : function * (msg) {
        if(this.force)
            return yield Promise.resolve(true);

        if((yield cli.prompt(msg))) {
            return yield Promise.resolve(true);
        } else {
            return yield Promise.resolve(false);
        }
    },

    log : function (msg) {
        if(!this.show_messages)
            return;

        if(!msg)
            msg = "";

        cli.log(msg);
    },

    noLog : function (msg) {
        if(this.show_messages)
            return;

        if(!msg)
            msg = "";

        cli.log(msg);
    },

    debug : function (msg) {
        if(!this.show_messages)
            return;

        if(!msg)
            msg = "";

        cli.debug(msg);
    },

    warn : function (msg) {
        if(!this.show_messages)
            return;

        if(!msg)
            msg = "";

        cli.warn(msg);
    },

    error : function (msg) {
        if(!msg)
            return;

        cli.error(msg);
    },

    verboseLog : function (msg) {
        if(!msg)
            msg = "";

        if(!this.verbose)
            return;

        this.warn(cli.color.gray('    ' + msg));
    },

    header : function (msg) {
        if(!this.show_messages)
            return;

        if(!msg)
            msg = "";

        cli.styledHeader(msg);
    },

    endingMessage : function () {
        if(!this.show_messages)
            return;

        let all_ending_messages = [
            "We did it! You are awesome!",
            "High five! Oh... I don't have hands.\nNevermind... Yay still!",
            "Keep doing what you do, you awesome bastard you!",
            "Yay! We did it!",
            "Phew, that was lot of crunching, but we did it!",
            "Dude, now that was some serious database work! Radical!",
            "Awesome work from the both of us!",
            "Hey, you the best!"
        ];

        this.log();
        this.log(`${cli.color.green(random_array_element(all_ending_messages))}`);
        this.log();
    },

    notify : function (msg, sound) {
        if(!msg)
            return;

        notifier.notify({
            title : "heroku-wp-database-sync",
            message : msg,
            sound : sound
        });
    },

    shellExec : function (cmd) {
        this.verboseLog(`Executing command:`);

        if(!this.more_verbose) {
            if(cmd.length > this.max_command_show_length + 3) {
                this.verboseLog(`   ${cmd.substr(0, this.max_command_show_length)}...`);
            } else {
                this.verboseLog(`   ${cmd.substr(0, this.max_command_show_length)}`);
            }
        } else {
            this.verboseLog(`   ${cmd}`);   
        }

        return shell.exec(cmd, {silent : !this.more_verbose});
    },

    runCommands : function (commands) {
        if(typeof(commands) == undefined)
            return;

        this.verboseLog(`Running commands:`);

        if(typeof(commands) == 'string') {
            if(commands.length == 0)
                return;

            this.shellExec(commands);
        } else if (typeof(commands) == 'object') {
            for(let c in commands) {
                if(commands[c].length == 0)
                    continue;

                this.shellExec(commands[c]);
            }
        }
    },

    getCommandsByName : function (name, env_config) {
        if(env_config.scripts != undefined) {
            for(let s in env_config.scripts) {
                if(s == name) {
                    return env_config.scripts[s];
                }
            }
        }

        return false;
    },

    runCommandsByName : function (name, env_config) {
        let commands = this.getCommandsByName(name, env_config)

        if(commands != false) {
            this.verboseLog(`Start running the ${name} command list.`);

            return this.runCommands(commands);
        }

        return false;
    },

    createDumpFilename : function (output, prefix, createdir) {
        let directory = './';

        let filename = prefix + dateformat(new Date(), "dd_mm_yyyy_HH_MM") + `.sql`;

        if(output) {
            if(output[output.length - 1] == '/') {
                directory = output;
            } else {
                filename = path.basename(output);
                directory = path.dirname(output);
            }
        }

        let location = path.resolve(directory) + '/' + filename;

        if(createdir) {
            if(!fs.existsSync(location)) {
                let dir = path.resolve(path.dirname(location));

                if(!fs.existsSync(dir)) {
                    shell.mkdir('-p', dir);
                }
            }
        }

        return location;
    },

    createSearchAndReplaceCommand : function (search, replace, dboptions, options) {
        let replace_exec_command = `php ${path.resolve(__dirname, "../")}/sar.php --user ${dboptions.user} `;

        if(dboptions.password != undefined && dboptions.password.length > 0) {
            replace_exec_command += `--pass ${dboptions.password} `;
        }

        replace_exec_command += `--host ${dboptions.host} --db ${dboptions.database} --search "${search}" --replace "${replace}"`;

        if(options.regexp != undefined && options.regexp) {
            replace_exec_command += ` --regexp`;
        }

        return replace_exec_command;
    },
    
    getTemporaryDumpFile : function (get_cache_filename, name) {
        if(get_cache_filename) {        
            var hash = crypto.createHmac('sha256', name).digest('hex');
            var temporary_dump_file = this.getSyncHomeDir() + '/cache/' + hash + '.sql';

            return temporary_dump_file;
        }
        
        return tmp.fileSync().name;
    }
}

module.exports = lib;