import * as urlparse from 'url-parse'
import ux from 'cli-ux'

import MySQL from '../MySQL';
import Colors from '../Colors';
import Cmd from '../Cmd';

export default class DBConfig {
    name : string = ""
    host : string = ""
    port : string = ""
    username : string = ""
    password : string = ""

    static fromURL (url : string) {
        var db_config = new DBConfig()

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
        return `-u"${this.username}" -h"${this.host}" --port="${this.port}"`
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

        let password_prefix = ""

        if(this.password) {
            password_prefix = `export MYSQL_PWD="${this.password}"`
        }

        return `${password_prefix} && mysqldump ${this.authString()} ${additional_arguments.join(" ")} ${this.name}`
    }
}