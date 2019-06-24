import DBConfig from './Structs/DBConfig';
import { ReplacerFunc } from './Syncfile'

export default class SearchReplace {
    from_db_config : DBConfig
    to_db_configs : DBConfig[]

    constructor (from_db_config : DBConfig, to_db_configs : DBConfig[]) {
        this.from_db_config = from_db_config
        this.to_db_configs = to_db_configs
    }

    async constructCMDS (from : string, to : string[] | string | ReplacerFunc)  {
        console.log(from, to)
    }
}