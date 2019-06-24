export default class Setup {
    name : string
    from : string
    to : string[] = []

    constructor (name : string, from : string, to : string []) {
        this.name = name
        this.from = from
        this.to = to
    }
}