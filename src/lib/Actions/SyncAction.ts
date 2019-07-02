import Env from '../Structs/Env';
import EnvCollection from '../EnvCollection';
import Action from '../Action';

export default class SyncAction implements Action {
    from : Env
    to_envs : EnvCollection
    project_name : string

    constructor (from : Env, to_envs : EnvCollection) {
        this.from = from
        this.project_name = from.app.project_name
        this.to_envs = to_envs
    }

    async runMutableChecks () {
        for(let env of this.to_envs.envs) {
            env.checkMutability()
        }
    }
}