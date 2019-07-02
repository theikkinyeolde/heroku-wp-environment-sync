import * as dotenv from 'dotenv'
import * as fs from 'fs'
import ux from 'cli-ux';

import DBConfig from './Structs/DBConfig';
import Cmd from './Cmd';
import Colors from './Colors'

export default class EnvFile {
    filename : string

    vars : dotenv.DotenvParseOutput = {}

    constructor (filename : string = ".env") {
        this.filename = filename
        
        if(this.exists(filename)) {
            const buf = fs.readFileSync(filename)
            
            const data = this.preprocessEnvFile(buf.toString())

            this.vars = dotenv.parse(data)
        } else {
            ux.error(`It seems a ${Colors.file(".env")} -file doesn't exist.`)
        }
    }

    exists(filename : string) {
        return fs.existsSync(filename)
    }

    preprocessEnvFile (data : string) {
        var lines = data.split("\n");
        var output = "";

        for (let l in lines) {
            var line = lines[l].trimLeft()
            
            if(line.length == 0 || line[0] == "#") {
                continue;
            }
            
            output += line + "\n";
        }

        return output;
    }

    exportVars () {
        let out = ""

        for(let e in this.vars) {
            let evar = this.vars[e]

            
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