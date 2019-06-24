import Env from './Structs/Env';
import DBConfig from './Structs/DBConfig';

export default class EnvCollection {
    envs : Env[] = []

    constructor (envs : Env[] = []) {
        this.envs = envs
    }

    async getDBConfigs () {
        let to_env_dbs : DBConfig[] = []

        for(let env of this.envs) {
            to_env_dbs.push(env.app.db_config)
        }

        return to_env_dbs
    }
}