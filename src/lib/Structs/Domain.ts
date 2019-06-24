export default class Domain {
    host : string = ""
    cert : boolean = false

    constructor (host : string, cert : boolean = false) {
        this.host = host
        this.cert = cert
    }
}