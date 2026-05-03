import config from "../../../config"
import parseString from "./parseString"

class Model {

    constructor() { }

    completions(params: {
        messages: Array<any>
        stream: boolean
        tools: Array<any>
    }, logback: (text: string) => void = () => { }, thinkback: (text: string) => void = () => { }) {
        return new Promise(function (resolve, reject) {

            let content = "", tool_calls: Array<any> = []
            let choices_handler = (choices: Array<any>) => {
                for (let i = 0; i < choices.length; i++) {

                    let reasoning = choices[i].delta.reasoning || choices[i].delta.reasoning_content
                    if (reasoning) {

                        if (/<\/think>/.test(reasoning)) {
                            let reasoning_content = reasoning.split("</think>")
                            reasoning = reasoning_content[0].replace("<think>", "")
                            choices[i].delta.content = reasoning[1] + (choices[i].delta.content || "")
                        }

                        thinkback(reasoning)
                    }

                    if (choices[i].delta.content) {
                        logback(choices[i].delta.content)
                        content += choices[i].delta.content
                    }

                    if (choices[i].delta.tool_calls) {
                        for (let tool_call of choices[i].delta.tool_calls) {
                            if (tool_call.id) {
                                tool_calls.push(tool_call)
                            } else {
                                tool_calls[tool_calls.length - 1].function.arguments += tool_call.function.arguments
                            }
                        }
                    }

                }
            }

            try {
                let data = ""
                const req = require(config.request).request({
                    hostname: config.hostname,
                    port: config.port,
                    path: config.path + '/chat/completions',
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + config.apiKey }
                }, (res: any) => {
                    res.on('data', (chunk: any) => {
                        if (params.stream) {
                            let chunkValue = parseString(chunk.toString())
                            if (Array.isArray(chunkValue)) {
                                for (let i = 0; i < chunkValue.length; i++) {
                                    choices_handler(chunkValue[i].choices)
                                }
                            } else {
                                choices_handler(chunkValue.choices)
                            }
                        } else {
                            data += chunk
                        }
                    })
                    res.on('end', () => {
                        if (!params.stream) {
                            choices_handler([{ delta: parseString(data).choices[0].message }])
                        }

                        resolve({
                            content,
                            tool_calls
                        })
                    })
                })

                let tools_description = []
                for (let tool of params.tools) {
                    tools_description.push(tool.description)
                }

                req.write(JSON.stringify({
                    model: config.model,
                    messages: params.messages,
                    tools: tools_description,
                    stream: params.stream
                }))
                req.on('error', (e: any) => {
                    reject(e)
                })

                req.end()
            } catch (e) {
                reject(e)
            }
        })
    }

}

export default Model