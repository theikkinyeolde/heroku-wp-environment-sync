import { ReplacerFunc } from './Syncfile'
import { APIClient } from '@heroku-cli/command';
import * as os from 'os'
import * as path from 'path'

export default class Globals {
    static syncfilename = "syncfile.js"
    static current_syncfile_version = "0.2.6"
    static default_local_server = "http://localhost:5000"
    static default_wp_installation_dir = "web/wp"
    static home_sync_folder = os.homedir() + "/.heroku-wp-environment-sync"
    static cache_data_file = Globals.home_sync_folder + "/cache_info.json"
    static heroku_client : APIClient
    static sync_plugin_root_folder = path.resolve(__dirname, '../../')
    static db_envs = [
        'JAWSDB_URL', 
        'CLEARDB_DATABASE_URL', 
        'DATABASE_URL'
    ]
    static default_replacer : ReplacerFunc = (prefix : string | boolean, from : string, to : string, url : any) => { return to }
    static verbose_level = 0

    static isVerbose () {
        return this.verbose_level > 0
    }

    static isMoreVerbose () {
        return this.verbose_level > 1
    }

    static init (heroku : APIClient) {
        Globals.heroku_client = heroku
    }
}