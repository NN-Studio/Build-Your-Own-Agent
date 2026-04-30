import { initOption } from "oipage/nodejs/option/index"
import callFuns from "./callFuns"
import callMiddleware from "./callMiddleware"

class Agent {
    config: any

    constructor(config: {
        model: any
        tools?: Array<any>
        systemPrompt?: string
        middleware?: Array<any>
    }) {
        this.config = initOption(config, {
            tools: [],
            systemPrompt: "",
            middleware: []
        })
    }

    invoke(option: any) {
        let _this = this

        let context = [{
            role: "system",
            content: _this.config.systemPrompt
        }, ...option.messages]

        callMiddleware(_this, "before_agent") // 调用智能体前

        return new Promise(function (resolve, reject) {

            (function doit() {

                callMiddleware(_this, "before_model") // 调用LLM前

                _this.config.model.completions({
                    stream: true,
                    messages: context,
                    tools: _this.config.tools
                }).then(function (result: any) {

                    callMiddleware(_this, "after_model") // 调用LLM后

                    if (result.content) {
                        context.push({
                            role: "assistant",
                            content: result.content
                        })
                    }

                    if (result.tool_calls && result.tool_calls.length > 0) {
                        context.push({
                            role: "assistant",
                            tool_calls: result.tool_calls
                        })
                        callFuns(_this, result.tool_calls).then(function (tool_results: Array<any>) {

                            for (let i = 0; i < result.tool_calls.length; i++) {
                                context.push({
                                    role: "tool",
                                    tool_call_id: result.tool_calls[i].id,
                                    tool_name: result.tool_calls[i].function.name,
                                    content: typeof tool_results[i] === "string" ? tool_results[i] : (JSON.stringify(tool_results[i]) + "")
                                })
                            }

                            doit()
                        })

                    } else {
                        resolve(result.content)

                        callMiddleware(_this, "after_agent") // 调用智能体后
                    }

                }).catch(function (error: any) {
                    reject(error)
                })

            })()

        })
    }
}

export default Agent