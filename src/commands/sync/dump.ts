import { Command, flags } from '@heroku-cli/command'
import * as Heroku from '@heroku-cli/schema'
import Syncfile from '../../lib/Syncfile';
import Env from '../../lib/Structs/Env';
import ux from 'cli-ux';
import SyncHelperCommand from '../../lib/SyncHelperCommand';
import Colors from '../../lib/Colors';

export default class DumpCommand extends SyncHelperCommand {
    static description = 'say hi to an app'

    static args = [
        {
            name : "environment",
            required : true
        }
    ]

    static flags = {
        remote: flags.app(),
        app: flags.app()
    }

    async run() {
        const { flags, args } = this.parse(DumpCommand)
        
        this.printLogo()

        let sync_file = await Syncfile.fromFile(this.heroku)

        const env = await sync_file.getEnvWithName(args.environment) as Env
        const date = new Date()

        ux.log()
        ux.styledHeader(`Database dump`)
        ux.log()
        
        ux.log(`Going to dump env ${Colors.env(args.environment, env.app.name)}`)

        let filename = env.app.name + ((env.app.name != env.name) ? "-" + env.name : "") + "-" + date.getDate() + "." + date.getMonth() + 1 + "." + date.getFullYear() + "-" + date.getHours() + "-" + date.getMinutes() + "-" + date.getSeconds() + ".sql"

        const file_location = await ux.prompt(`Dump file location`, {
            default : process.cwd() + "/" + filename
        })

        this.startProcess()

        await env.app.getDump(file_location)

        this.endProcess()
    }
}