import Model from "@build-your-own-agent/model"

const llm = new Model()

const readPlain = {
    "description": {
        "type": "function",
        "function": {
            "name": "readPlain",
            "description": "读取文本文件中的内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "filepath": {
                        "type": "string",
                        "description": "需要读取的文本文件的全路径",
                    }
                },
                "required": ["filepath"],
            },
        },
    }
    // 模型本身不执行，所以valueOf不需要
}

llm.completions({
    // stream: false,
    stream: true,
    messages: [
        // {
        //     role: "user",
        //     content: "你是谁？"
        // }
        {
            role: "user",
            content: "告诉我文件./.mailmap中的内容是什么"
        }
    ],
    tools: [readPlain]
    // tools: []
}, function logback(text) { // 响应日志
    process.stdout.write(text)
}, function thinkback(text) { // 思考日志
    process.stdout.write("\x1b[34m" + text + "\x1b[0m")
}).then(function (result) { // 返回
    console.log("[返回]", result)
}).catch(function (error) { // 错误
    console.log("[错误]", error)
})