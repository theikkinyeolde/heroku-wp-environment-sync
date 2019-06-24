import {Command} from '@heroku-cli/command'
import * as Heroku from '@heroku-cli/schema'
import ux from 'cli-ux'
import * as lodash from 'lodash'

import RemoteApp from './Apps/RemoteApp';
import Colors from './Colors';
import { IConfig } from '@oclif/config';
import CacheHandler from './CacheHandler';

export default abstract class SyncHelperCommand extends Command {
    timer : number = 0
    totalPauseTimes : number = 0
    pauseTimes : number = 0
    process_started = false

    constructor (argv : string[], config : IConfig) {
        super(argv, config)

        const terminate_function = async () => {
            const resolved = await new Promise(async (resolve, reject) => {
                await this.endCommandGracefully()

                resolve(true)
            })

            process.exit();
        }

        process.on('SIGTERM', terminate_function);
        process.on('SIGINT', terminate_function)
    }

    async endCommandGracefully () {
        if(!this.process_started) {
            return
        }

        ux.log()
        ux.styledHeader(`Exit`);
        ux.log()
        ux.log(`Exited the program. Some cleanups probably happened, I dunno...`)
        ux.log()
    }

    pauseTimer () {
        this.pauseTimes = Date.now()
    }

    endPause () {
        this.totalPauseTimes += this.pauseTimes - Date.now()
        this.pauseTimes = 0
    }

    printLogo () {
        this.log();
        this.log(`=> ${Colors.logo("WP Heroku Database Sync")}`);
        this.log();
    }
    
    startProcess () {
        this.timer = Date.now()
        this.process_started = true
    }

    endProcess () {
        const farewell_words = [
            `Take care!`,
            `Farewell!`,
            `Adios!`,
            `Ciao!`
        ]

        ux.log()
        ux.styledHeader(`Completion`)
        ux.log()
        
        ux.log(`The task has been completed now!`)
        ux.log(`The whole thing took ${Colors.success(`${(Date.now() - this.timer) / 1000}`)} seconds.`)
        ux.log(lodash.shuffle(farewell_words)[0])
    }

}