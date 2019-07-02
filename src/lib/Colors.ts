import color from '@heroku-cli/color'

export default class Colors {
    static env (msg : string, app : string | null = null) {
        return `${color.yellow(msg)}${((app) ? ` (${Colors.app(app)})`: '') }`
    }

    static app (msg : string) {
        return color.app(msg)
    }

    static localApp (msg : string) {
        const c = color.rgb(255, 255, 255)

        return c(msg)
    }

    static replace (msg : string) {
        return color.magenta(msg)
    }

    static fail (msg : string) {
        return color.redBright(msg)
    }

    static success (msg : string) {
        return color.green(msg)
    }

    static domain (msg : string) {
        const c = color.rgb(255, 128, 0)

        return c(msg)
    }

    static logo (msg : string) {
        return color.cyan(msg)
    }

    static file (msg : string) {
        return color.bgBlue(color.white(msg))
    }

    static cmd (msg : string) {
        return color.bgCyanBright(color.black(msg))
    }

    static hidden (msg : string) {
        return color.gray(msg)
    }

    static error (msg : string) {
        return color.red(msg)
    }

    static time (msg : string) {
        const c = color.rgb(50, 159, 95)

        return c(msg)
    }
}