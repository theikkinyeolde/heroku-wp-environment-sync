import { exec } from 'child_process'
import ux from 'cli-ux';
import Colors from './Colors';
import Globals from './Globals';

export default class Cmd {
    static async exec (cmd : string, report_errors = true) {
        return new Promise(async (resolve, reject) => {
            if(Globals.verbose_level > 1) {
                ux.log(`${Colors.hidden(`Running command: ${cmd}`)}`)
            }

            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    if(report_errors) {
                        ux.error(`Command failed for some reason. ${error}`)
                    }

                    return reject(stdout);
                }

                if (stderr) {
                    if(report_errors) {
                        ux.error(`Command failed for some reason with the command:\n    ${Colors.hidden(cmd)}\n\nError output:\n    ${Colors.error(stderr)}`)
                    }

                    return reject(stdout);
                }

                resolve(stdout);
            });
        });
    }

    /*
    * We got to make our own function for wp cli execs, because we can't suppress 
    * the goddamn notices and warnings from coming to the stderr and ruining our error reporting.
    */
    static async execParsedErrors (cmd : string, error_reporting = true) {
        return new Promise(async (resolve, reject) => {
            if(Globals.verbose_level > 1) {
                ux.log(`${Colors.hidden(`Running command: ${cmd}`)}`)
            }

            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    if(error.message.match(/Error(.+?)\:/i)) {
                        if(error_reporting) {
                            ux.error(`Command failed for some reason. ${error}`)
                        }

                        return reject(stdout);
                    }
                }

                if (stderr) {
                    if(stderr.match(/Error(.+?)\:/i)) {
                        if(error_reporting) {
                            ux.error(`Command failed for some reason with the command:\n    ${Colors.hidden(cmd)}\n\nError output:\n    ${Colors.error(stderr)}`)
                        }

                        return reject(stdout);
                    }
                }

                resolve(stdout);
            });
        });
    }
}