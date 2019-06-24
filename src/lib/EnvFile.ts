import * as dotenv from 'dotenv'
import * as fs from 'fs'
import ux from 'cli-ux';

import DBConfig from './Structs/DBConfig';

export default class EnvFile {
    filename : string

    vars : dotenv.DotenvParseOutput = {}

    constructor (filename : string = ".env") {
        this.filename = filename
        
        if(fs.existsSync(filename)) {
            const buf = fs.readFileSync(filename)
            this.vars = dotenv.parse(buf)
        } else {
            ux.warn("Env file doesn't exist!")
        }
    }

    getDBConfig () {
        var dbconfig = new DBConfig();
        dbconfig.name = ((this.vars.DB_NAME) ? this.vars.DB_NAME : "")

        dbconfig.host = ((this.vars.DB_HOST) ? this.vars.DB_HOST : "localhost")
        dbconfig.port = ((this.vars.DB_PORT) ? this.vars.DB_PORT : "3306")
        dbconfig.username = ((this.vars.DB_USER) ? this.vars.DB_USER : "root")
        dbconfig.password = ((this.vars.DB_PASS) ? this.vars.DB_PASS : "")

        return dbconfig
    }
}