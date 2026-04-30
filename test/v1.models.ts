import config from "../config"

let data = ""
const req = require(config.request).request({
    hostname: config.hostname,
    port: config.port,
    path: config.path + '/models', // 获取当前可用模型列表
    method: 'GET',
    headers: { Authorization: 'Bearer ' + config.apiKey }
}, (res: any) => {
    res.on('data', (chunk: any) => {
        data += chunk
    })
    res.on('end', () => {

        // 返回数据例子：
        // {
        //     "object": "list",
        //         "data": [{
        //             "id": "qwen3:latest",
        //             "object": "model",
        //             "created": 1773324984,
        //             "owned_by": "library"
        //         }]
        // }
        console.log(data)
    })
})

req.end()