import Env from '../Structs/Env';
import EnvCollection from '../EnvCollection';
import Action from '../Action';

export default class SyncAction implements Action {
    from : Env
    to_envs : EnvCollection

    constructor (from : Env, to_envs : EnvCollection) {
        this.from = from
        this.to_envs = to_envs
    }

    async runMutableChecks () {
        for(let env of this.to_envs.envs) {
            env.checkMutability()
        }
    }
}