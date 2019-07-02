import * as fs from 'fs'
import ux from 'cli-ux'
import { APIClient } from '@heroku-cli/command';

import Env from './Structs/Env';
import Globals from './Globals';
import RemoteApp from './Apps/RemoteApp';
import AppInterface from './Apps/AppInterface';
import EnvOptions from './EnvOptions';
import Setup from './Structs/Setup';
import LocalApp from './Apps/LocalApp';
import EnvCollection from './EnvCollection';
import ParsedURL from './Structs/ParsedUrl';
import Colors from './Colors';

export type ReplacerFunc = (prefix : string | boolean, from : string, to : string, url : ParsedURL) => string | null | undefined

export default class Syncfile {
    filename : string = ""
    name : string = ""
    version : string = ""
    setups : Setup[] = []
    environments : Env[] = []
    heroku : APIClient 
    static instance : Syncfile

    constructor (heroku : APIClient, filename : string | null = null) {
        if(!filename) {
            filename = Globals.syncfilename
        }

        Syncfile.instance = this

        this.heroku = heroku

        this.filename = filename
    }
    
    static async fromFile (heroku : APIClient, filename : string | null = null) {
        const sync_file = new Syncfile(heroku, filename)

        await sync_file.loadFromFile()

        return sync_file
    }

    async exists (filename = this.filename) {
        return fs.existsSync(filename)
    }

    async loadFromFile (filename = this.filename) {
        if(!await this.exists(filename)) {
            ux.error(`Syncfile doesn't exist! Create it using the ${Colors.cmd("heroku sync:init")} -command.`)
        }
        
        const data = require(`${process.cwd()}/${this.filename}`)

        this.name = data.name

        this.version = data.version
        for(let s in data.setups) {
            let setup = data.setups[s]
            this.setups.push(new Setup(s, setup.from, setup.to))
        }

        for(let e in data.environments) {
            let env = data.environments[e]

            let new_app : AppInterface

            if(env.options && env.options.is_local && env.url) {
                new_app = new LocalApp(env.url)
            } else {
                new_app = new RemoteApp(env.app, env.db_env_name)
            }

            new_app.project_name = this.name
            
            let new_env = new Env(e, env.mutable, new_app, env.options)
            
            new_app.setEnv(new_env)

            await new_app.load()

            if(env.replacer && env.replacer instanceof Function) {
                new_env.replacer = env.replacer
            }

            this.environments.push(new_env)
        }
    }

    async envFromApp (name : string, app : AppInterface, mutable = false, options ? : EnvOptions) {
        let new_env = new Env(name, mutable, app, options)

        app.setEnv(new_env)

        await app.load()

        this.environments.push(new_env)

        return new_env
    }
    
    async getEnvWithName (name : string) {
        for(let env of this.environments) {
            if(env.name == name) {
                return env
            }
        }

        ux.error(`Could not find environment with the name ${name}.`)
    }

    async getEnvsWithNames (names : string []) {
        let envs : EnvCollection = new EnvCollection()

        for(let name of names) {
            let env = await this.getEnvWithName(name) as Env

            envs.envs.push(env)
        }

        return envs
    }

    async getLocalEnv () {
        for(let env of this.environments) {
            if(env.options) {
                if(env.options.is_local) {
                    return env
                }
            }
        }

        return null
    }

    async addSetup (name : string, from : string, to : string []) {
        this.setups.push(new Setup(name, from, to))
    }

    async getSetupWithName (name : string) {
        for(let setup of this.setups) {
            if(setup.name == name) {
                return setup
            }
        }

        ux.error(`Could not find setup with the name ${name}.`)
    }

    async getSyncJSONObject () {

        let environments_output : {[id : string] : any} = {}

        for(let env of this.environments) {
            let env_obj : any = {}

            if(env.app.name) {
                env_obj.app = env.app.name
            }
            
            if(env.mutable) {
                env_obj.mutable = true
            }

            if(env.app.url) {
                env_obj.url = env.app.url
            }
            
            if(env.options) {
                env_obj.options = env.options
            }

            if(env.app.db_env_name) {
                env_obj.db_env = env.app.db_env_name
            }

            environments_output[env.name] = env_obj
        }

        let setups_output : {[id : string] : any } = {}

        for(let setup of this.setups) {
            setups_output[setup.name] = {
                from : setup.from,
                to : setup.to
            }
        }

        let project_name : string = this.name

        let syncfile_data = {
            name : project_name,
            version : Globals.current_syncfile_version,
            setups : setups_output,
            environments : environments_output
        }

        return syncfile_data
    }

    async toString () {
        let new_syncfile = "module.exports = " + JSON.stringify(await this.getSyncJSONObject(), null, 4)

        return new_syncfile
    }

    async saveToFile () {
        ux.action.start(`Writing the syncfile to ${this.filename}.`)

        fs.writeFileSync(this.filename, await this.toString())        

        ux.action.stop()
    }
}