import DBConfig from '../Structs/DBConfig';
import ReplacerFunc from '../Structs/Env'
import Domain from '../Structs/Domain'
import Env from '../Structs/Env';
import { env } from 'shelljs';
import CacheHandler from '../CacheHandler';

export default interface AppInterface {
    name : string
    url? : string

    domains : Domain []
    db_env_name : string
    db_config : DBConfig
    wp_dir? : string

    project_name : string

    env : Env | null
    cache : CacheHandler | null

    sql_dump_file : string

    load () : void
    getDump (filename? : string | null, use_cache? : boolean) : Promise<string> | string
    pushDump (filename : string) : Promise<boolean> | boolean

    setEnv (env : Env | null) : void
}