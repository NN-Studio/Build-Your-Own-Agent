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

                    if (choices[i].delta.reasoning) {
                        thinkback(choices[i].delta.reasoning)
                    }

                    if (choices[i].delta.content) {
                        logback(choices[i].delta.content)
                        content += choices[i].delta.content
                    }

                    if (choices[i].delta.tool_calls) {
                        for (let tool_call of choices[i].delta.tool_calls) {
                            tool_calls.push(tool_call)
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
                            choices_handler(parseString(chunk.toString()).choices)
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