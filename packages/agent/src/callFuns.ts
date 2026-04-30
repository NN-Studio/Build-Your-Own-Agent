export default function (_this: any, tool_calls: Array<any>): Promise<Array<any>> {
    return new Promise(function (resolve, reject) {

        let all = []
        for (let i = 0; i < tool_calls.length; i++) {
            for (let j = 0; j < _this.config.tools.length; j++) {
                if (_this.config.tools[j].description.function.name === tool_calls[i].function.name) {
                    let result = _this.config.tools[j].valueOf(JSON.parse(tool_calls[i].function.arguments))
                    if (typeof result === "object" && result.constructor === Promise) {
                        all.push(new Promise(function (resolve, reject) {
                            result.then(function (data) {
                                resolve(data)
                            }).catch(function (e) {
                                resolve("运行出错:" + e)
                            })
                        }))
                    } else {
                        all.push(result)
                    }
                    break
                }
            }
            if (!all[i]) all.push("工具" + tool_calls[i].function.name + "不存在")
        }

        Promise.all(all).then(function (tool_results) {
            resolve(tool_results)
        })

    })
}