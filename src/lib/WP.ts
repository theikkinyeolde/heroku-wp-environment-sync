import Syncfile from './Syncfile';
import Cmd from './Cmd';
import ux from 'cli-ux';
import { exit } from 'shelljs';
import * as glob from 'glob';
import * as path from 'path'
import * as fs from 'fs'
import Globals from './Globals'
import Colors from './Colors';
import commandExists = require('command-exists');

export default class WP {
    static async runReplaceCommand (from : string | RegExp, to : string) {
        const cmd = await this.searchReplaceCommand(from, to)

        if(cmd) {
            const ret = await Cmd.execParsedErrors(cmd) as string
            const matches = ret.match(/Made ([0-9]+) replacements\./m)

            if(matches) {
                return matches[1]
            }
        }

        return null
    }

    static async toolExists () {
        if(!commandExists.sync("wp")) {
            ux.error(`It seems that ${Colors.cmd("wp")} -command doesn't exist! Have you installed WP CLI?`)
        }
    }
    
    static async searchWPLocation () {
        let ret = glob.sync("**/wp-load.php", {})

        if(ret.length == 0) {
            return false
        }

        return `./${path.dirname(path.relative(process.cwd(), ret[0]))}`
    }

    static async checkWPInstallation (path : string) {
        return new Promise((resolve, reject) => {
            Cmd.execParsedErrors(`export \`cat .env\` && wp core is-installed --path="${path}"`, false)
                .catch(() => {
                    resolve(false)
                })
                .then(() => {
                    resolve(true)
                })
        })
    }

    static async searchReplaceCommand (from : string | RegExp, to : string) {
        const local_env = await Syncfile.instance.getLocalEnv();

        if(local_env && local_env.options && local_env.options.wp_dir) {
            return `export \`cat .env\` && wp search-replace --path="${local_env.options.wp_dir}" --url="${from}" "${from}" "${to}" --recurse-objects --precise ${(from instanceof RegExp) ? '--regex' : ''}`
        }

        return null
    }
}