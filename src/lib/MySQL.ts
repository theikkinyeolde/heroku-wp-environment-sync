import {SemVer, parse as SemVerParse } from 'semver'
import DBConfig from './Structs/DBConfig'

import Env from './Structs/Env'
import Syncfile from './Syncfile'
import Cmd from './Cmd';
import commandExists = require('command-exists');
import ux from 'cli-ux';
import Colors from './Colors';

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