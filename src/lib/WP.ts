import Syncfile from './Syncfile';
import Cmd from './Cmd';
import ux from 'cli-ux';
import { exit } from 'shelljs';

export default class WP {
    static async runReplaceCommand (from : string | RegExp, to : string) {
        const cmd = await this.searchReplaceCommand(from, to)

        if(cmd) {
            const ret = await Cmd.exec(cmd) as string
            const matches = ret.match(/Made ([0-9]+) replacements\./m)

            if(matches) {
                return matches[1]
            }
        }

        return null
    }

    static async checkWPInstallation (path : string) {
        const cmd = await Cmd.exec(`export \`cat .env\` && wp core is-installed --path="${path}"`)

        if(cmd) {
            return false
        }

        return true
    }

    static async searchReplaceCommand (from : string | RegExp, to : string) {
        const local_env = await Syncfile.instance.getLocalEnv();

        if(local_env && local_env.options && local_env.options.wp_dir) {
            return `export \`cat .env\` && wp search-replace --path="${local_env.options.wp_dir}" --url="${from}" "${from}" "${to}" --recurse-objects --precise ${(from instanceof RegExp) ? '--regex' : ''}`
        }

        return null
    }
}