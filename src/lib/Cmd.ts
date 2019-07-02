import { exec } from 'child_process'
import ux from 'cli-ux';
import Colors from './Colors';
import Globals from './Globals';

export default class Cmd {
    static async exec (cmd : string) {
        return new Promise(async (resolve, reject) => {
            if(Globals.verbose_level > 1) {
                ux.log(`${Colors.hidden(`Running command: ${cmd}`)}`)
            }

            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    ux.error(`Command failed for some reason. ${error}`)
    
                    return reject(stdout);
                }

                if (stderr) {
                    ux.error(`Command failed for some reason with the command:\n    ${Colors.hidden(cmd)}\n\nError output:\n    ${Colors.error(stderr)}`)
    
                    return reject(stdout);
                }

                resolve(stdout);
            });
        });
    }
}