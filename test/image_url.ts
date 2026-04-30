import config from "../config"

const params = {
    model: config.model,
    messages: [{
        role: "user",
        content: [
            {
                'type': 'text',
                'text': "告诉我图片内容?"
            },
            {
                'type': 'image_url',
                'image_url': "data:image/jpeg;base64," + require("fs").readFileSync("./images/zxl20070701.jpg").toString('base64')
            },
        ]
    }],
    tools: [],
    stream: false
}

let data = ""
const req = require(config.request).request({
    hostname: config.hostname,
    port: config.port,
    path: config.path + '/chat/completions',
    method: 'POST',
    headers: { Authorization: 'Bearer ' + config.apiKey }
}, (res: any) => {
    res.on('data', (chunk: any) => {
        data += chunk
    })
    res.on('end', () => {
        console.log(data)
    })
})

req.write(JSON.stringify(params))

req.end()