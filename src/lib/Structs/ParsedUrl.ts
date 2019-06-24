import * as urlparse from 'url-parse'

//@ts-ignore
import * as parsedomain from 'parse-domain'

export default class ParsedURL {
    full : string
    protocol : string
    hash : string
    query : { [key: string]: string | undefined }
    pathname : string
    auth : string
    host : string
    port : string
    username : string
    password : string
    prefix : string = ""
    domain : string = ""
    extension : string = ""

    constructor (url : string) {
        let url_obj = new urlparse(url)

        this.full = url
        this.protocol = url_obj.protocol
        this.hash = url_obj.hash
        this.query = url_obj.query
        this.pathname = url_obj.pathname
        this.auth = url_obj.auth
        this.host = url_obj.hostname
        this.port = url_obj.port
        this.username = url_obj.username
        this.password = url_obj.password

        let subdomain_matches = url.match(/https?\:\/\/(.+?)(\.(.+?))?\./)

        if(subdomain_matches) {
            if(subdomain_matches[3]) {
                this.domain = subdomain_matches[3]
                this.prefix = subdomain_matches[1]
            } else {
                this.domain = subdomain_matches[1]       
            }
        }
    }
}