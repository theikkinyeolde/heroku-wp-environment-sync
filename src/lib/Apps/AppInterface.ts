import DBConfig from '../Structs/DBConfig';
import ReplacerFunc from '../Structs/Env'
import Domain from '../Structs/Domain'
import Env from '../Structs/Env';

export default interface AppInterface {
    name : string
    url? : string

    domains : Domain []
    db_env_name : string
    db_config : DBConfig
    wp_dir? : string

    env : Env | null

    sql_dump_file : string

    load () : void
    getDump (filename? : string | null, use_cache? : boolean) : Promise<string> | string
    pushDump (filename : string) : Promise<boolean> | boolean
}