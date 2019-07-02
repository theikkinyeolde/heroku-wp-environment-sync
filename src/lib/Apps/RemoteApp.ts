import {Command, APIClient} from '@heroku-cli/command'
import * as Heroku from '@heroku-cli/schema'
import * as fs from 'fs'
import ux from 'cli-ux'
import * as lodash from 'lodash'

import SyncHelperCommand from '../SyncHelperCommand';
import AppInterface from './AppInterface';
import DBConfig from '../Structs/DBConfig';
import Domain from '../Structs/Domain';
import Cmd from '../Cmd';
import Env from '../Structs/Env';
import Syncfile from '../Syncfile';
import Colors from '../Colors';
import CacheHandler from '../CacheHandler';
import Globals from '../Globals';
import MySQL from '../MySQL';

export default class RemoteApp implements AppInterface {
    name : string

    db_env_name : string = ""
    db_mysql_url : string = ""
    db_envs : {[id : string] : string} = {}
    
    db_config : DBConfig = new DBConfig("", "", "")
    info : Heroku.App = {}
    envs : {[id : string] : string} = {}
    domains : Domain [] = []
    sql_dump_file : string = ""
    heroku : APIClient | null = null
    cache : CacheHandler | null = null

    project_name : string = ""

    env : Env | null = null

    constructor (name : string, db_env_name? : string) {
        this.name = name

        if(db_env_name) {
            this.db_env_name = db_env_name
        }
    }

    setEnv (env : Env | null) {
        if(env != null) {
            this.cache = new CacheHandler(env)
        }

        this.env = env

    }

    async load () {
        ux.action.start(`Fetching app information for ${Colors.app(this.name)}`);
        
        await this.populateEnvs()
        await this.populateAppData()
        await this.fetchDomains()
        await this.fetchAppDBEnv()
        await this.setDBConfig()
        await this.checkRemoteApp()

        ux.action.stop();
    }

    private async populateEnvs () {
        ux.action.status = "Fetcing env variables"

        const response = await Syncfile.instance.heroku.get<Heroku.ConfigVars>(`/apps/${this.name}/config-vars`)
        const res_envs = response.body

        this.envs = res_envs
    }

    private async populateAppData () {
        ux.action.status = "Fetching app data"

        const response = await Syncfile.instance.heroku.get<Heroku.App>(`/apps/${this.name}`)
        
        this.info = response.body
    }

    async fetchDomains () {
        ux.action.status = "Fetching domain information"

        const response = await Syncfile.instance.heroku.get<Heroku.Domain>(`/apps/${this.name}/domains`)

        for(let d in response.body) {
            const domain_obj = response.body[d]
            this.domains.push(new Domain(domain_obj.hostname, (domain_obj.acm_status) ? true : false))
        }
    }

    async setDBConfig () {
        ux.action.status = "Creating database configuration"

        this.db_config = DBConfig.fromURL(this.db_mysql_url)
    }
    
    async fetchAppDBEnv () {
        ux.action.status = "Fetching app database env variables"

        if(this.db_env_name.length) {
            return
        }

        for(let env_name of Globals.db_envs) {
            if(Object.keys(this.envs).indexOf(env_name) !== -1) {
                this.db_envs[env_name] = this.envs[env_name];
            }
        }

        if(Object.values(this.db_envs).length == 1) {
            this.db_env_name = Object.keys(this.db_envs)[0];
            this.db_mysql_url = Object.values(this.db_envs)[0];
            this.db_config = DBConfig.fromURL(this.db_mysql_url)
        }
    }

    async getDump (filename : string | null = null, use_cache = false) {
        this.cache = new CacheHandler(this.env)

        await this.verifyDatabaseExistance()

        const dump_filename = await this.cache.getDumpFilename(filename, use_cache)
        
        if(dump_filename) {
            this.sql_dump_file = dump_filename
        }

        if(!this.sql_dump_file.length) {
            ux.error(`Db dump filename (${Colors.file(this.sql_dump_file)}) is empty for app (${Colors.app(this.name)}).`)
            return ""
        }

        if(use_cache && await this.cache.doesCacheFileExist()) {
            ux.log(`Using cached database. Updated last time: ${Colors.time(await this.cache.getCacheFreshness() as string)} `)
        } else {
            CacheHandler.status[dump_filename as string] = false

            ux.action.start(`Fetching database for ${Colors.app(this.name)}`)
            
            let time = 0
            const interval_func = () => {
                ux.action.status = "Working"

                for(let t = 0; t < time; t++) {
                    ux.action.status += "."
                }

                time++

                if(time == 5) {
                    time = 0
                }
            }

            interval_func()

            let interval = setInterval(interval_func, 1000)

            await Cmd.execParsedErrors(`${await this.db_config.toDumpCmd()} > ${this.sql_dump_file}`)
            
            clearInterval(interval)

            ux.action.stop()

            CacheHandler.status[dump_filename as string] = true

            fs.copyFileSync(dump_filename as string, await this.cache.getCacheFileName() as string)
        }

        return this.sql_dump_file
    }

    async verifyDatabaseExistance () {
        if(!this.db_config) {
            return false
        }

        if(!await MySQL.databaseExists(this.db_config)) {
            ux.error(`Database doesn't exist for ${this.env ? Colors.env(this.env.name) : ''} (${Colors.app(this.name)})`)
        }
    }

    async pushDump (filename : string | null = null) {
        await this.verifyDatabaseExistance()
        
        if(!filename) {
            ux.error(`Dump filename is empty.`)
            return false
        }

        if(!fs.existsSync(filename)) {
            ux.error(`Dump file (${filename}) doesn't exist.`)
            return false
        }

        ux.action.start(`Pushing db dump to ${Colors.app(this.name)}`)
        
        //await Cmd.exec(`mysql ${await this.db_config.authString()} ${this.db_config.name} < ${file_name}`)

        ux.action.stop()

        return true
    }

    async hasAppEnv (envkey : string) {
        for(let e in this.envs) {
            if(e == envkey) {
                return true;
            }
        }

        return false;
    }


    async handleEnvNotRecognized () {
        ux.warn(`Could not find any of the recognized db env variable names in the app ${Colors.app(this.name)}.`);

        ux.warn(`These are the searched db env variable names: ${this.constructEnvList(this.db_envs)}`);

        ux.log();
                
        while(!this.db_env_name) {
            const input_variable_name = await ux.confirm("Do you want to input the db environment variable name? ")

            if(!input_variable_name) {
                ux.error(`Ok, cannot resolve the db env variable name, so quitting.`)
                return false
            }

            const new_env = await ux.prompt(`Type in the env variable in the app ${Colors.app(this.name)}`)
            
            const exists = await this.hasAppEnv(new_env);

            if(!exists) {
                ux.warn(`The ${Colors.app(new_env)} -app doesn't have that env variable .`);
                continue
            }

            this.db_env_name = new_env;
        }

        return true
    }

    async handleMultipleEnvs () {
        ux.warn(`There is multiple db env variables defined (${this.constructEnvList(this.db_envs)}), which one is it?`)

        while(!this.db_env_name.length) {
            const db_env_name = await ux.prompt(`The db env variable name`) as string

            if(!this.hasAppEnv(db_env_name)) {
                ux.warn(`That env variable name (${Colors.env(db_env_name)}) doesn't exist in app (${Colors.app(this.name)})`);

                if(!(await ux.confirm("Want to to try again?"))) {
                    ux.error(`Ok, cannot resolve the db env variable name, so quitting.`)
                }
            } else {
                this.db_env_name = db_env_name
            }
        }

        return true
    }

    async checkRemoteApp () {
        ux.action.status = "Remote app checking"

        if(!this.db_env_name.length) {
            if(Object.keys(this.db_envs).length > 1) {
                return await this.handleMultipleEnvs()
            } else {
                return await this.handleEnvNotRecognized()
            }
        }        

        return true
    }

    async cachedSearchesAndReplaces () {
        if(this.cache == null) {
            return false;
        }

        const cache_data = await CacheHandler.getCacheDataFile()
        
        console.log(cache_data)
        
    }

    constructEnvList (envs : {[id : string] : string}) {
        let env_list = ``

        for(let env_name of Object.values(envs)) {
            if(env_list.length) {
                env_list += `, `
            }

            env_list += `${Colors.env(env_name)}`
        }
        
        return env_list
    }

}