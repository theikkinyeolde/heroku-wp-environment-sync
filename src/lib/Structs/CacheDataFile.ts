import * as fs from 'fs'

import Globals from '../Globals';
import ux from 'cli-ux';
import Colors from '../Colors';

export class CacheDataEnvReplaces {
    from : string = ""
    to : string = ""
    replaced_hosts : string [] = []

    constructor (from : string, to : string, replaced_hosts : string [] = []) {
        this.from = from
        this.to = to
        this.replaced_hosts = replaced_hosts
    }
}

export class CacheDataProject {
    name : string = ""
    replaces : CacheDataEnvReplaces [] = []

    constructor (name : string, replaces : CacheDataEnvReplaces [] = []) {
        if(name.length == 0) {
            ux.error(`Project is missing a name. Check your ${Colors.file("syncfile.js")}.`)
        }

        this.name = name
        this.replaces = replaces
    }

    async existsCacheEnvReplaces (from : string, to : string) {
        for(let r in this.replaces) {
            let replace = this.replaces[r]
                
            if(replace.from == from && replace.to == to) {
                return replace
            }
        }

        return false
    }

    async addReplace (from : string, to : string, new_host : string) {
        for(let r in this.replaces) {
            let replace = this.replaces[r]
                
            if(replace.from == from && replace.to == to) {
                this.replaces[r].replaced_hosts.push(new_host)
                return
            }
        }

        let new_replaces = new CacheDataEnvReplaces(from, to, [new_host])

        this.replaces.push(new_replaces)
    }
}

export default class CacheDataFile {
    projects : {[key : string] : CacheDataProject } = {}
    filename : string = ""

    constructor () {
        
    }
    
    async saveToFile (filename : string = this.filename) {
        ux.action.start(`Writing the cache data config to ${filename}.`)

        fs.writeFileSync(this.filename, JSON.stringify(this))       

        ux.action.stop()
    }

    static async loadFromFile (filename : string = Globals.cache_data_file) {
        ux.action.start(`Loading the cache data config from ${filename}.`)

        const datafile = JSON.parse(fs.readFileSync(filename).toString())

        return Object.assign(CacheDataFile, datafile)
    }
}