import {SemVer, parse as SemVerParse } from 'semver'
import DBConfig from './Structs/DBConfig'

import Env from './Structs/Env'
import Syncfile from './Syncfile'
import Cmd from './Cmd';

export default class MySQL {
    static local_mysql_version : SemVer | null = null;

    static async getCurrentVersion () {
        if(MySQL.local_mysql_version) {
            return MySQL.local_mysql_version;
        }

        const local_env = await Syncfile.instance.getLocalEnv()

        if(!local_env) {
            return ""
        }

        const out = await Cmd.exec(`mysql ${local_env.app.db_config.authString()} -s -N -e"SELECT VERSION()"`)
        const version = out.toString().replace(/[^0-9\.]/g, '') as string

        return MySQL.local_mysql_version = SemVerParse(version)
    }
}