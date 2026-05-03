import Model from "@build-your-own-agent/model"
import Agent from "@build-your-own-agent/agent"

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
    },
    "valueOf": function (args: any) {
        return require("oipage/nodejs/disk/index.js").readPlain(args.filepath)
    }
}

const agent = new Agent({
    model: new Model(),
    tools: [readPlain],
    systemPrompt: "",
    middleware: [{
        before_agent() {
            console.log("before_agent")
        },
        before_model() {
            console.log("before_model")
        },
        after_model() {
            console.log("after_model")
        },
        after_agent() {
            console.log("after_agent")
        }
    }]
})

agent.invoke({
    messages: [{ role: "user", content: "告诉我文件./.mailmap中的内容是什么" }],
}).then((result: any) => {
    console.log(result);
})