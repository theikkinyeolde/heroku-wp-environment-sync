import { APIClient } from '@heroku-cli/command';
import ux from 'cli-ux';

import RemoteApp from '../Apps/RemoteApp'
import AppInterface from '../Apps/AppInterface';
import EnvOptions from '../EnvOptions';
import Globals from '../Globals';
import Syncfile, {ReplacerFunc} from '../Syncfile'

export default class Env {
    name : string
    app : AppInterface 
    mutable = false
    options ? : EnvOptions
    replacer : ReplacerFunc = Globals.default_replacer

    constructor (name : string, mutable = false, app : AppInterface, options ? : EnvOptions) {
        this.name = name
        this.app = app
        this.mutable = mutable

        if(options) {
            this.options = options
        }
    }

    async checkMutability () {
        if(!this.mutable) {
            ux.error(`Location with the name ${this.name} is not mutable and you are trying to sync to it.`)
        }
    }
}