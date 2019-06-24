import * as fs from 'fs';
import ux from 'cli-ux';
import * as crypto from 'crypto'
import * as tmp from 'tmp'

import Globals from './Globals';
import Env from './Structs/Env';

export default class CacheHandler {
    env : Env | null

    static status : {[id : string] : boolean} = {}

    static instance : CacheHandler | null = null

    constructor (env : Env | null) {
        this.env = env

        CacheHandler.instance = this
    }

    static init (env : Env | null) {
        if(this.instance) {
            return this.instance
        }

        return this.instance = new CacheHandler(env)
    }

    isValid () {
        return this.env != null
    }

    static usingCache () {
        return true
    }

    async getCacheFolder () {
        return Globals.home_sync_folder + '/cache/'
    }

    async getCacheFileName () {
        if(!this.env) {
            return false
        }

        return await this.getCacheFolder() + crypto.createHmac('sha256', this.env.name + "-" + this.env.app.name).digest('hex') + '.sql'
    }

    async doesCacheFileExist () {
        const filename = await this.getCacheFileName()

        if(!filename) {
            return false
        }

        return fs.existsSync(filename)
    }

    async getCacheFreshness () {
        const filename = await this.getCacheFileName()

        if(!filename) {
            return false
        }

        const stats = fs.statSync(filename as string);
        const date = stats.mtime

        return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()} - ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`
    }

    async getDumpFilename (filename : string | null, use_cache = false) {
        if(filename) {
            return filename
        } else if (this.env && CacheHandler.usingCache && use_cache) {
            await this.cacheFolderInit()
            return await this.getCacheFileName()
        } else {
            return tmp.fileSync().name
        }
    }

    toggleCache (cache : string) {
        return CacheHandler.status[cache] = !CacheHandler.status[cache]
    }

    static async removeUnfinishedCache () {
        if(!Object.keys(CacheHandler.status).length) {
            return
        }

        ux.action.start(`Removing unfinished caches`)

        for(let cache in CacheHandler.status) {
            if(!CacheHandler.status[cache]) {
                fs.unlinkSync(cache)
                ux.action.status = `Removing ${cache}`
            }
        }

        ux.action.stop()
    }

    async cacheFolderInit () {
        if(!fs.existsSync(await this.getCacheFolder())) {
            ux.warn(`Sync cache folder doesn't exist.`)

            const create_folder = await ux.confirm(`Wan't to create it?`)
        
            if(create_folder) {
                ux.action.start(`Creating folder to ${await this.getCacheFolder()}`)

                fs.mkdirSync(await this.getCacheFolder(), {
                    recursive : true
                })

                ux.action.stop()
                ux.log()
            }
        }
    }
}