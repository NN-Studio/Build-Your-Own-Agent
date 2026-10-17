import { Unit } from "@oipage/testjs"
import parseString from "../packages/model/src/parseString"
import callFuns from "../packages/agent/src/callFuns"

let { describe, it, expect } = Unit.node()

// =============================================================================
// parseString：SSE / OpenAI 兼容返回字符串解析
// =============================================================================

describe("model/parseString", () => {

    it("解析单条 data: 前缀", () => {
        const json = parseString("data: {\"a\":1}\n\n")
        expect(json.a).toBe(1)
    })

    it("多条 SSE 用逗号拼成数组", () => {
        const sse = "data: {\"a\":1}\n\ndata: {\"a\":2}\n\n"
        const arr = parseString(sse)
        expect(Array.isArray(arr)).toBe(true)
        expect(arr.length).toBe(2)
        expect(arr[0].a).toBe(1)
        expect(arr[1].a).toBe(2)
    })

    it("data: [DONE] 返回空数组", () => {
        const r = parseString("data: [DONE]")
        expect(Array.isArray(r)).toBe(true)
        expect(r.length).toBe(0)
    })

    it("解析失败静默丢弃，返回空数组", () => {
        // 当前实现：坏 chunk 静默丢掉（不让单条坏数据把整轮 reject），
        // 故对纯坏 JSON 的输入返回 []，而不是抛错。
        const r = parseString("data: {not json}")
        expect(Array.isArray(r)).toBe(true)
        expect(r.length).toBe(0)
    })

    it("纯 JSON 字符串也可解析", () => {
        const r = parseString("{\"x\":42}")
        expect(r.x).toBe(42)
    })
})

// =============================================================================
// callFuns：按 tool_calls 匹配 tool 并执行 valueOf
// =============================================================================

describe("agent/callFuns", () => {

    // 构造一个伪 Agent：包含 config.tools 即可
    function mockAgent(tools: Array<any>) {
        return { config: { tools } }
    }

    it("同步返回值的工具按 tool_call_id 对齐", async () => {
        const tools = [{
            description: { type: "function", function: { name: "echo" } },
            valueOf: (args: any) => "echo:" + args.text
        }]
        const agent = mockAgent(tools)
        const tool_calls = [{
            id: "call_1",
            function: { name: "echo", arguments: JSON.stringify({ text: "hi" }) }
        }]

        const results = await callFuns(agent, tool_calls)
        expect(results[0]).toBe("echo:hi")
    })

    it("Promise 返回值的工具成功时拿到 data", async () => {
        const tools = [{
            description: { type: "function", function: { name: "slow" } },
            valueOf: (_: any) => Promise.resolve("ok")
        }]
        const results = await callFuns(mockAgent(tools), [{
            id: "call_2", function: { name: "slow", arguments: "{}" }
        }])
        expect(results[0]).toBe("ok")
    })

    it("Promise 返回值的工具失败时返回 '运行出错:...' 字符串", async () => {
        const tools = [{
            description: { type: "function", function: { name: "boom" } },
            valueOf: (_: any) => Promise.reject(new Error("kaboom"))
        }]
        const results = await callFuns(mockAgent(tools), [{
            id: "call_3", function: { name: "boom", arguments: "{}" }
        }])
        expect(String(results[0]).indexOf("运行出错:") >= 0).toBe(true)
    })

    it("工具不存在时返回 '工具<name>不存在' 占位", async () => {
        const results = await callFuns(mockAgent([]), [{
            id: "call_x", function: { name: "ghost", arguments: "{}" }
        }])
        expect(results[0]).toBe("工具ghost不存在")
    })

    it("多个工具调用并行执行，结果顺序与输入一致", async () => {
        const tools = [
            {
                description: { type: "function", function: { name: "a" } },
                valueOf: (_: any) => Promise.resolve("A")
            },
            {
                description: { type: "function", function: { name: "b" } },
                valueOf: (_: any) => Promise.resolve("B")
            }
        ]
        const tool_calls = [
            { id: "c1", function: { name: "a", arguments: "{}" } },
            { id: "c2", function: { name: "b", arguments: "{}" } }
        ]
        const results = await callFuns(mockAgent(tools), tool_calls)
        expect(results[0]).toBe("A")
        expect(results[1]).toBe("B")
    })
})