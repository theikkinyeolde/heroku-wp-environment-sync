import * as Heroku from '@heroku-cli/schema'
import ux from 'cli-ux'

import SyncHelperCommand from '../../lib/SyncHelperCommand'
import RemoteApp from '../../lib/Apps/RemoteApp'
import Globals from '../../lib/Globals'
import Syncfile from '../../lib/Syncfile'
import LocalApp from '../../lib/Apps/LocalApp';
import Colors from '../../lib/Colors';
import WP from '../../lib/WP';
import EnvFile from '../../lib/EnvFile';
import MySQL from '../../lib/MySQL';
import DBConfig from '../../lib/Structs/DBConfig';

export default class InitCommand extends SyncHelperCommand {
    static description = 'Initialize the syncfile configurations.'

    static args = [
        {
            name : "production",
            description : "The name of the app that has the production environment.",
            required : true
        },
        {
            name : "staging",
            description : "The name of the app that has the staging environment. (optional)"
        }
    ]


    async run() {
        this.printLogo();

        const { args } = this.parse(InitCommand)

        let new_syncfile = new Syncfile(this.heroku)

        if(await new_syncfile.exists()) {
            ux.error(`${Colors.file("syncfile.js")} already exists. Remove the earlier one to run this command!`)
        }

        
        var env_file = new EnvFile();

        // Handle production
        {
            await new_syncfile.envFromApp("production", new RemoteApp(args.production))
        }

        // Handle staging 
        {
            let app_staging : RemoteApp

            if(args.staging) {
                await new_syncfile.envFromApp("staging", new RemoteApp(args.staging), true)
                await new_syncfile.addSetup("staging", "production", ["staging"])
            }
        }

        {
            new_syncfile.name = await ux.prompt(`Input the projects name`, {
                default : args.production
            })
        }

        // Handle localhost
        {
            let local_dev_server = await ux.prompt(`Input your local dev server address`, {
                default : Globals.default_local_server
            })

            let local_db_config = env_file.getDBConfig();
            
            await MySQL.localDatabaseCreationQuestionare(local_db_config)

            ux.action.start("Finding wordpress installation location.")

            let wp_installation_dir = await WP.searchWPLocation()

            ux.action.stop()

            if(wp_installation_dir == false) {
                ux.log()
                ux.log(`Tried to search wordpress installation folder automatically, but failed.`)

                wp_installation_dir = await ux.prompt(`Input the path to your wordpress installation folder`, {
                    default : Globals.default_wp_installation_dir
                })
            }

            wp_installation_dir = wp_installation_dir as string

            if(!await WP.checkWPInstallation(wp_installation_dir)) {
                ux.error(`Seems that wp installation directory (${Colors.file(wp_installation_dir)}) isn't a correct wp installation directory.`)
            }

            await new_syncfile.envFromApp("localhost", new LocalApp(local_dev_server), true, {
                is_local : true,
                wp_dir : wp_installation_dir
            })

            await new_syncfile.addSetup("localhost", "production", ["localhost"])
        }

        new_syncfile.saveToFile()

        ux.log()
        ux.log(`Syncfile (${Colors.file(Globals.syncfilename)}) has been successfully created in this current directory!`)
    }
} 