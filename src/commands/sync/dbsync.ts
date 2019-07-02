import { flags } from '@heroku-cli/command'
import ux from 'cli-ux';

import SyncHelperCommand from '../../lib/SyncHelperCommand';
import Syncfile from '../../lib/Syncfile';
import Env from '../../lib/Structs/Env';
import Setup from '../../lib/Structs/Setup';
import ParsedURL from '../../lib/Structs/ParsedUrl';
import WP from '../../lib/WP';
import EnvCollection from '../../lib/EnvCollection';
import SyncAction from '../../lib/Actions/SyncAction';
import LocalApp from '../../lib/Apps/LocalApp';
import Colors from '../../lib/Colors';
import CacheHandler from '../../lib/CacheHandler';
import Globals from '../../lib/Globals';
import CacheDataFile, { CacheDataEnvReplaces, CacheDataProject } from '../../lib/Structs/CacheDataFile';
import { sync } from 'glob';
import MySQL from '../../lib/MySQL';

export default class DBSyncCommand extends SyncHelperCommand {
    static description = 'say hi to an app'

    static args = [
        {
            name : "setup",
            description : "Specify setup to use when syncing."
        }
    ]

    static flags = {
        from: flags.app(),
        to: flags.app(),
        "skip-replaces" : flags.boolean(),
        "use-cache" : flags.boolean({
            default : false
        }),
        verbose : flags.boolean(),
        "more-verbose" : flags.boolean()
    }

    async confirmProcess (sync_action : SyncAction) {
        ux.log()
        ux.styledHeader("Confirmation")
        ux.log()

        ux.log(`Operations that are about to be done:`)

        for(let to_env of sync_action.to_envs.envs) {
            ux.log(` - From ${Colors.env(sync_action.from.name, sync_action.from.app.name)} -> ${Colors.env(to_env.name, (!(to_env.app instanceof LocalApp)) ? to_env.app.name : null)}`)
        }

        ux.log()

        if(!await ux.confirm(`Are you sure you want to do this?`)) {
            ux.error(`Cancelled the operation.`)
        }
    }

    async runReplaces (sync_action : SyncAction, override_replace_cache = false) {
        const to_env_dbs = await sync_action.to_envs.getDBConfigs()

        ux.log()
        ux.styledHeader(`Replacing urls`)
        ux.log()

        for(let from_domain of sync_action.from.app.domains) {
            let skip_from_domain = false
            for(let to_env of sync_action.to_envs.envs) {          
                const mutations = [
                    from_domain.host,
                    from_domain.host.replace(/ä/ig, 'a').replace(/ö/ig, 'o').replace(/ü/ig, 'u').replace(/ß/ig, 'ss')
                ]

                let replacements = []
                for(let mut of mutations) {
                    replacements.push({
                        prefix : "https", host : mut
                    })
                    replacements.push({
                        prefix : "http", host : mut
                    })
                    replacements.push({
                        prefix : false, host : mut
                    })
                }

                ux.action.start(`Replace ${Colors.domain(from_domain.host)} -domain`)
    
                let amount = 0
                               
                for(let replacement_from of replacements) {

                    let url = new ParsedURL(((replacement_from.prefix) ? replacement_from.prefix + "://" : 'http://') +replacement_from.host)
    
                    const replace_to_text = to_env.replacer(replacement_from.prefix, replacement_from.host, (to_env.app.url) ? to_env.app.url : '', url)
    
                    if(!replace_to_text || !replace_to_text.length) {
                        continue
                    }
                    
                    const from = ((replacement_from.prefix) ? replacement_from.prefix + "://" : '') + replacement_from.host

                    ux.action.status = `Replacing ${Colors.replace(from)} to ${Colors.replace(replace_to_text)}`

                    let amount_of_replaces = parseInt(await WP.runReplaceCommand(from, replace_to_text) as string)

                    amount += amount_of_replaces
                }

                ux.action.stop(`${((amount) ? Colors.success(`${amount} replacements executed!`) : Colors.fail(`Didn't execute any replacements.`))}`)
            }
        }
    }

    async endCommandGracefully () {
        await CacheHandler.removeUnfinishedCache()

        await super.endCommandGracefully()
    }

    async run() {
        this.printLogo()

        let cache_file = new CacheDataFile()
        cache_file.projects["TEST"] = new CacheDataProject("TEST")
        cache_file.projects["TEST"].replaces.push(new CacheDataEnvReplaces("perse", "paska", [
            "www.perse.com"
        ]))

        let json = JSON.stringify(cache_file)

        console.log(json)

        cache_file = Object.assign(new CacheDataFile, JSON.parse(json))

        console.log(cache_file.projects["TEST"].replaces)

        return

        const { flags, args } = this.parse(DBSyncCommand)

        if(flags.verbose && !flags["more-verbose"]) {
            Globals.verbose_level = 1
        } else if (flags["more-verbose"]) {
            Globals.verbose_level = 2
        }

        const syncfile = await Syncfile.fromFile(this.heroku)

        await MySQL.toolExists()
        await WP.toolExists()

        if(!args.setup) {

            let setup_list = "";

            for(let setup of syncfile.setups) {
                setup_list += `  * ${setup.name}\n`
            }

            ux.error(`\nSetups available:\n${setup_list}\nNo setup specified and also no [from] and [to] flags specified. Exiting...\n`)
        }

        const setup = await syncfile.getSetupWithName(args.setup) as Setup

        if(!setup) {
            ux.error(`No setup found with the name ${args.setup}.`)
        }

        let sync_action = new SyncAction (await syncfile.getEnvWithName(setup.from) as Env, await syncfile.getEnvsWithNames(setup.to) as EnvCollection)

        await sync_action.runMutableChecks();

        // Confirm the whole process
        //await this.confirmProcess(sync_action)

        // Start the process and the clock
        await this.startProcess()

        ux.log()
        ux.styledHeader("Database sync")
        ux.log()

        // Fetchs the from app
        await sync_action.from.app.getDump(null, flags["use-cache"])

        // Push all the databases to the destination apps
        for (let to_env of sync_action.to_envs.envs) {
            await to_env.app.pushDump(sync_action.from.app.sql_dump_file)
        }

        if(flags["skip-replaces"] != true) {
            await this.runReplaces(sync_action)      
        }

        this.endProcess()
    }
}