import * as path from "path"
import Model from "@build-your-own-agent/model"
import Agent from "@build-your-own-agent/agent"
import { tools, systemPrompt as toolsPrompt } from "@build-your-own-agent/tools"
import { buildSystemPrompt } from "@build-your-own-agent/use-skills"
import { logform } from "oipage/nodejs/logform/index.js"

const REPO_ROOT = path.resolve(__dirname, "..")

const agent = new Agent({
    model: new Model(),
    tools,
    systemPrompt: buildSystemPrompt(toolsPrompt, REPO_ROOT),
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