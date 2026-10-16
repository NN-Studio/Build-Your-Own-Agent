import { toolHandlers } from "../tools"
import { ToolCallResult } from "../types"

interface CallParams {
    name: string
    arguments?: any
}

export async function handleToolsCall(params: CallParams): Promise<ToolCallResult> {
    const { name, arguments: args = {} } = params || ({} as CallParams)

    if (!name || typeof name !== "string") {
        return {
            content: [{ type: "text", text: "参数 name 必填" }],
            isError: true
        }
    }

    const handler = toolHandlers[name]
    if (!handler) {
        return {
            content: [{ type: "text", text: `工具 ${name} 不存在` }],
            isError: true
        }
    }

    try {
        return await handler(args)
    } catch (e: any) {
        return {
            content: [{ type: "text", text: `工具执行出错：${e?.message || e}` }],
            isError: true
        }
    }
}