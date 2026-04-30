import Model from "@build-your-own-agent/model"
import Agent from "@build-your-own-agent/agent"
import { logform } from "oipage/nodejs/logform/index.js"

const agent = new Agent({
    model: new Model(),
    tools: [],
    systemPrompt: "",
})

logform([{
    type: "input",
    label: "请输入："
}]).then(result => {

    agent.invoke({
        messages: [{ role: "user", content: result[0] }],
    }).then((result: any) => {
        console.log(result)
    })

})