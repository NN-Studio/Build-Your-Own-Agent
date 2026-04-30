export default function (_this: any, hook_name: string, hook_args: any = void 0) {
    for (let middleware of _this.config.middleware) {

        if (middleware[hook_name]) {
            middleware[hook_name](hook_args)
        }

    }
}