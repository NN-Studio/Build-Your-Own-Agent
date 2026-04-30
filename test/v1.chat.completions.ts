import config from "../config"

const params = {
    model: config.model,
    messages: [{
        role: "user",
        content: "你是谁？"
    }],
    tools: [],
    stream: true
}

let data = ""
const req = require(config.request).request({
    hostname: config.hostname,
    port: config.port,
    path: config.path + '/chat/completions', // 多轮聊天接口
    method: 'POST',
    headers: { Authorization: 'Bearer ' + config.apiKey }
}, (res: any) => {
    res.on('data', (chunk: any) => {
        if (params.stream) {
            console.log("[流数据]", chunk.toString())
        } else {
            data += chunk
        }
    })
    res.on('end', () => {
        if (!params.stream) console.log("[完整数据]", data)
        console.log("[结束]")
    })
})

req.write(JSON.stringify(params))
req.on('error', (e: any) => {
    console.log("[发生错误]", e)
})

req.end()