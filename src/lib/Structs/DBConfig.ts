import * as urlparse from 'url-parse'
import ux from 'cli-ux'

import MySQL from '../MySQL';
import Colors from '../Colors';
import Cmd from '../Cmd';
import EnvFile from '../EnvFile';

export default class DBConfig {
    name : string = ""
    host : string = ""
    port : string = ""
    username : string = ""
    password : string = ""
    
    constructor(name : string, username : string, password : string, host : string = "127.0.0.1", port = "3306") {
        this.name = name
        this.username = username
        this.password = password
        this.host = host
        this.port = port
    }

    static fromURL (url : string) {
        var db_config = new DBConfig("","","")

        let parsed_url = new urlparse(url)

        let protocol = parsed_url.protocol.replace(/\:$/, "")

        if(protocol != "mysql") {
            ux.error(`Database protocol should be mysql in the app ${Colors.app(this.name)} (currently ${protocol}).`)
        }

        db_config.name = parsed_url.pathname.replace(/^\//, '')
        db_config.host = parsed_url.hostname
        db_config.port = parsed_url.port
        db_config.username = parsed_url.username
        db_config.password = parsed_url.password

        return db_config
    }

    authString () {
        return `${(this.password) ? `-p"${this.password}"`: ''} -u"${this.username}" -h"${this.host}" --port="${this.port}"`
    }

    toURL () {
        return `mysql://${this.username}:${this.password}@${this.host}/${this.name}`
    }

    async toDumpCmd () {
        const semver = await MySQL.getCurrentVersion()

        let additional_arguments = []

        // Fix for the mysql bug: https://bugs.mysql.com/bug.php?id=89825
        if(semver && semver.major >= 8) {
            additional_arguments.push("--column-statistics=0")
        }

        additional_arguments.push("--single-transaction")
        additional_arguments.push("--set-gtid-purged=OFF")
        additional_arguments.push("--quick")

        return `mysqldump ${this.authString()} ${additional_arguments.join(" ")} ${this.name}`
    }
}