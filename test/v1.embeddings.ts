import config from "../config"

const params = {
    model: config.model,
    input: ["今天天气真好", "阳光明媚"]
}

let data = ""
const req = require(config.request).request({
    hostname: config.hostname,
    port: config.port,
    path: config.path + '/embeddings', // 将文本转换为数值向量（即嵌入向量）
    method: 'POST',
    headers: { Authorization: 'Bearer ' + config.apiKey }
}, (res: any) => {
    res.on('data', (chunk: any) => {
        data += chunk
    })
    res.on('end', () => {

        // 返回数据例子：
        // 部分模型可能不支持
        // {"error":{"message":"this model does not support embeddings","type":"api_error","param":null,"code":null}}
        console.log(data)
    })
})

req.write(JSON.stringify(params))

req.end()