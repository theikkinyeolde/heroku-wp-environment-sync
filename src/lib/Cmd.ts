import { exec } from 'child_process'
import ux from 'cli-ux';

export default class Cmd {
    static async exec (cmd : string) {
        return new Promise(async (resolve, reject) => {
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    return resolve(stdout);
                }

                if (stderr) {
                    return resolve(stdout);
                }

                resolve(stdout);
            });
        });
    }
}