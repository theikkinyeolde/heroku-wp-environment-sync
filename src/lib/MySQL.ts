import {SemVer, parse as SemVerParse } from 'semver'
import DBConfig from './Structs/DBConfig'

import Env from './Structs/Env'
import Syncfile from './Syncfile'
import Cmd from './Cmd';
import commandExists = require('command-exists');
import ux from 'cli-ux';
import Colors from './Colors';
import EnvFile from './EnvFile';

export default class MySQL {
    static local_mysql_version : SemVer | null = null;

    static async toolExists () {
        if(!commandExists.sync("mysql")) {
            ux.error(`It seems that ${Colors.cmd("mysql")} -command doesn't exist! Have you installed mysql?`)
        }

        if(!commandExists.sync("mysqldump")) {
            ux.error(`It seems that ${Colors.cmd("mysqldump")} -command doesn't exist! Have you installed mysql?`)
        }
    }

    static async databaseExists (db_config : DBConfig) {
        return new Promise(async (resolve, reject) => {
            Cmd.execParsedErrors(`mysql ${db_config.authString()} -e 'use ${db_config.name}'`, false)
                .catch(() => {
                    resolve(false)
                }).then(() => {
                    resolve(true)
                });
        })
    }

    static async createLocalDatabase () {
        let local_db_config = (new EnvFile()).getDBConfig()
        
        await Cmd.exec(`mysqladmin create ${local_db_config.name} ${local_db_config.authString()}`) 
    }

    static async localDatabaseCreationQuestionare (db_config : DBConfig) {
        if(!await MySQL.databaseExists(db_config)) {
            ux.log(`Local database ${Colors.db(db_config.name)} doesn't exist!`)
            if(await ux.confirm(`Do you want try to create it?`)) {
                await MySQL.createLocalDatabase()

                if(!await MySQL.databaseExists(db_config)) {
                    ux.error(`Local database ${Colors.db(db_config.name)} still doesn't exist! Cannot continue!`)
                }
            } else {
                ux.error(`Cannot continue without the local database!`);
            }
        }
    }

    static async getCurrentVersion () {
        if(MySQL.local_mysql_version) {
            return MySQL.local_mysql_version;
        }

        const local_env = await Syncfile.instance.getLocalEnv()

        if(!local_env) {
            return ""
        }

        const out = await Cmd.exec(`mysql ${local_env.app.db_config.authString()} -s -N -e"SELECT VERSION()"`) as string
        const version = out.toString().replace(/[^0-9\.]/g, '') as string

        return MySQL.local_mysql_version = SemVerParse(version)
    }
}