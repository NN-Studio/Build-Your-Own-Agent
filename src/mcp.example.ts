// src/mcp.example.ts
// @build-your-own-agent/mcp-server 的三种使用示例
//
// 运行：`pnpm ts-node ./src/mcp.example.ts`（先在另一个终端跑 `pnpm mcp` 或 `pnpm --filter @build-your-own-agent/mcp-server dev`）
//
// 三个示例分别展示：
//   A. 作为独立子进程，通过 stdio JSON-RPC 调它的工具
//   B. 把 MCP tools/list 的结果直接喂给 LLM（function calling 风格）
//   C. 把 MCP Client 包装成 Agent 的 tool，挂到 @build-your-own-agent/agent 上

import { spawn, ChildProcessWithoutNullStreams } from "child_process"
import * as readline from "readline"

// =============================================================================
// MCP Client：和 MCP 服务层走 stdio JSON-RPC 的最小封装
// =============================================================================

class McpClient {
    private proc: ChildProcessWithoutNullStreams
    private rl: readline.Interface
    private nextId = 1
    private pending: Map<number, { resolve: (v: any) => void; reject: (e: any) => void }> = new Map()

    constructor(bin: string, args: string[] = []) {
        this.proc = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] })
        // 把 MCP server 的 stderr 透传到容器（方便调试）
        this.proc.stderr.on("data", (chunk) => process.stderr.write(`[mcp] ${chunk}`))
        this.rl = readline.createInterface({ input: this.proc.stdout, crlfDelay: Infinity })

        this.rl.on("line", (line) => {
            const trimmed = line.trim()
            if (!trimmed) return
            try {
                const msg = JSON.parse(trimmed)
                if (msg.id != null && this.pending.has(msg.id)) {
                    const { resolve, reject } = this.pending.get(msg.id)!
                    this.pending.delete(msg.id)
                    if (msg.error) reject(new Error(msg.error.message))
                    else resolve(msg.result)
                }
            } catch {
                // ignore parse error from non-JSON lines
            }
        })

        this.proc.on("exit", (code) => {
            for (const { reject } of this.pending.values()) {
                reject(new Error(`mcp-server 退出 code=${code}`))
            }
            this.pending.clear()
        })
    }

    request(method: string, params?: any): Promise<any> {
        const id = this.nextId++
        const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params })
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject })
            this.proc.stdin.write(payload + "\n")
        })
    }

    notify(method: string, params?: any): void {
        const payload = JSON.stringify({ jsonrpc: "2.0", method, params })
        this.proc.stdin.write(payload + "\n")
    }

    close(): void {
        try { this.proc.stdin.end() } catch {}
        this.rl.close()
        this.proc.kill()
    }
}

// =============================================================================
// 示例 A：最基础 —— 列出工具、调用 read_file
// =============================================================================

async function exampleA() {
    console.log("\n=== 示例 A：列出工具 + 调用 read_file ===")
    const mcp = new McpClient("npx", ["ts-node", "./packages/mcp-server/src/index.ts"])

    try {
        // 1) 握手
        const init = await mcp.request("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "mcp.example", version: "0.1.0" }
        })
        console.log("serverInfo:", init.serverInfo)
        mcp.notify("notifications/initialized")

        // 2) 列出工具
        const { tools } = await mcp.request("tools/list")
        console.log("工具数量:", tools.length)
        console.log("工具列表:", tools.map((t: any) => t.name).join(", "))

        // 3) 调用 read_file
        const result = await mcp.request("tools/call", {
            name: "read_file",
            arguments: { path: "package.json", maxBytes: 256 }
        })
        console.log("read_file 返回:", result.content[0].text.slice(0, 120) + "...")
    } finally {
        mcp.close()
    }
}

// =============================================================================
// 示例 B：把 MCP tools/list 转成 OpenAI 兼容 schema 给 LLM
// =============================================================================

async function exampleB() {
    console.log("\n=== 示例 B：MCP tools → OpenAI function calling schema ===")
    const mcp = new McpClient("npx", ["ts-node", "./packages/mcp-server/src/index.ts"])

    try {
        await mcp.request("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "mcp.example", version: "0.1.0" }
        })
        mcp.notify("notifications/initialized")

        const { tools } = await mcp.request("tools/list")

        // 转成 OpenAI tools 数组（inputSchema 已经是 JSON Schema，直接用）
        const openaiTools = tools.map((t: any) => ({
            type: "function",
            function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema
            }
        }))

        console.log("OpenAI tools 数量:", openaiTools.length)
        console.log("样例：", JSON.stringify(openaiTools[0], null, 2))

        // 假设 LLM 返回了 tool_call，可直接转发给 MCP：
        const fakeToolCall = {
            id: "call_1",
            type: "function",
            function: {
                name: "list_dir",
                arguments: JSON.stringify({ path: "packages/agent/src" })
            }
        }
        const toolOut = await mcp.request("tools/call", {
            name: fakeToolCall.function.name,
            arguments: JSON.parse(fakeToolCall.function.arguments)
        })
        console.log("list_dir 输出：\n", toolOut.content[0].text)
    } finally {
        mcp.close()
    }
}

// =============================================================================
// 示例 C：把 MCP Client 包装成 Agent tool，挂到 @build-your-own-agent/agent
// =============================================================================

import Agent from "@build-your-own-agent/agent"
import Model from "@build-your-own-agent/model"

async function exampleC() {
    console.log("\n=== 示例 C：MCP → Agent tool（需要 MODEL_BASE_URL 环境变量）===")
    if (!process.env.MODEL_BASE_URL) {
        console.log("[跳过] 未配置 MODEL_BASE_URL，此示例需要真实模型端点。")
        return
    }

    const mcp = new McpClient("npx", ["ts-node", "./packages/mcp-server/src/index.ts"])
    try {
        await mcp.request("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "mcp.example", version: "0.1.0" }
        })
        mcp.notify("notifications/initialized")

        const { tools: mcpTools } = await mcp.request("tools/list")

        // 把每个 MCP 工具包装成 Agent 期望的 { description, valueOf } 形态
        const agentTools = mcpTools.map((t: any) => ({
            description: {
                type: "function",
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.inputSchema
                }
            },
            valueOf: (args: any) =>
                mcp
                    .request("tools/call", { name: t.name, arguments: args })
                    .then((res: any) => res.content.map((c: any) => c.text).join("\n"))
        }))

        const agent = new Agent({
            model: new Model(),
            tools: agentTools,
            systemPrompt: "你可以调用本地代码工具（read_file / list_dir / search_code / run_command）协助回答。"
        })

        const result = await agent.invoke({
            messages: [{ role: "user", content: "列出 packages/agent/src 下有哪些文件" }]
        })
        console.log("Agent 最终回复：\n", result)
    } finally {
        mcp.close()
    }
}

// =============================================================================
// 入口
// =============================================================================

;(async () => {
    const which = process.argv[2] || "A"
    if (which === "A") await exampleA()
    else if (which === "B") await exampleB()
    else if (which === "C") await exampleC()
    else if (which === "all") {
        await exampleA()
        await exampleB()
        await exampleC()
    } else {
        console.log("用法：ts-node src/mcp.example.ts [A|B|C|all]")
    }
})().catch(err => {
    console.error("出错：", err)
    process.exit(1)
})