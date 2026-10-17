import { Unit } from "@oipage/testjs"
import * as path from "path"

import { isPathAllowed, isInPackagesSrc, repoRoot } from "../packages/mcp-server/src/sandbox"
import { tools, toolHandlers } from "../packages/mcp-server/src/tools"
import { handleToolsList } from "../packages/mcp-server/src/methods/tools.list"
import { handleToolsCall } from "../packages/mcp-server/src/methods/tools.call"
import { handleResourcesList } from "../packages/mcp-server/src/methods/resources.list"
import { handleResourcesRead } from "../packages/mcp-server/src/methods/resources.read"
import { handleInitialize } from "../packages/mcp-server/src/methods/initialize"
import { Server } from "../packages/mcp-server/src/server"
import { JsonRpcRequest, JsonRpcNotification, ErrorCode } from "../packages/mcp-server/src/types"

const { describe, it, expect } = Unit.node()

const REPO_ROOT = repoRoot()

// =============================================================================
// 异步测试串行 runner：与 tools.spec.ts 共用同一套拦截框架策略
// =============================================================================

type Case = { name: string; run: () => void | Promise<void> }
const asyncCases: Case[] = []

function test(name: string, run: () => void | Promise<void>) {
    if (run.constructor.name === "AsyncFunction") {
        asyncCases.push({ name, run })
    } else {
        it(name, run as () => void)
    }
}

let asyncDone = false
let asyncFailed = 0
const originalExit = process.exit.bind(process)
;(process as any).exit = (code?: number) => {
    if (code === 0 && !asyncDone) return
    originalExit(code as any)
}

// =============================================================================
// sandbox：路径白名单（同步）
// =============================================================================

describe("mcp-server/sandbox", () => {

    it("仓库内路径放行", () => {
        expect(isPathAllowed("README.md")).toBe(true)
        expect(isPathAllowed("packages/mcp-server/src")).toBe(true)
    })

    it("仓库外相对路径拒绝", () => {
        expect(isPathAllowed("../etc")).toBe(false)
        expect(isPathAllowed("packages/../../etc")).toBe(false)
    })

    it("仓库外绝对路径拒绝", () => {
        expect(isPathAllowed("/etc/passwd")).toBe(false)
        expect(isPathAllowed("/tmp")).toBe(false)
    })

    it("isInPackagesSrc 仅匹配 packages/*/src", () => {
        expect(isInPackagesSrc("packages/mcp-server/src/index.ts")).toBe(true)
        expect(isInPackagesSrc("packages/mcp-server/bin/run")).toBe(false)
        expect(isInPackagesSrc("src/index.ts")).toBe(false)
    })

    it("repoRoot 返回绝对路径且指向当前仓库根", () => {
        expect(path.isAbsolute(REPO_ROOT)).toBe(true)
        expect(REPO_ROOT.endsWith("Build-Your-Own-Agent-master")).toBe(true)
        expect(require("fs").existsSync(path.join(REPO_ROOT, "package.json"))).toBe(true)
    })
})

// =============================================================================
// 工具注册表：tools / toolHandlers（同步）
// =============================================================================

describe("mcp-server/tools 工具注册表", () => {

    it("默认注册 4 个工具：read_file / list_dir / search_code / run_command", () => {
        const names = tools.map((t) => t.name)
        expect(names.indexOf("read_file") >= 0).toBe(true)
        expect(names.indexOf("list_dir") >= 0).toBe(true)
        expect(names.indexOf("search_code") >= 0).toBe(true)
        expect(names.indexOf("run_command") >= 0).toBe(true)
    })

    it("每个 ToolDefinition 都带 name / description / inputSchema", () => {
        for (const t of tools) {
            expect(typeof t.name).toBe("string")
            expect(t.name.length > 0).toBe(true)
            expect(typeof t.description).toBe("string")
            expect(t.inputSchema.type).toBe("object")
        }
    })

    it("toolHandlers 中的 name 与 tools 数组一一对应", () => {
        for (const t of tools) {
            expect(typeof toolHandlers[t.name]).toBe("function")
        }
    })
})

// =============================================================================
// tools/list 方法（同步）
// =============================================================================

describe("mcp-server/methods/tools.list", () => {

    it("返回 { tools } 且 tools 数组与注册表一致", () => {
        const res = handleToolsList({})
        expect(Array.isArray(res.tools)).toBe(true)
        expect(res.tools.length).toBe(tools.length)
        expect(res.tools[0].name).toBe(tools[0].name)
    })
})

// =============================================================================
// tools/call 方法（异步：handler 都是 async）
// =============================================================================

describe("mcp-server/methods/tools.call", () => {

    test("name 缺失返回 isError", async () => {
        const r: any = await handleToolsCall({ name: "" })
        expect(r.isError).toBe(true)
        expect(r.content[0].text.indexOf("必填") >= 0).toBe(true)
    })

    test("不存在的工具名返回 isError", async () => {
        const r: any = await handleToolsCall({ name: "ghost_tool", arguments: {} })
        expect(r.isError).toBe(true)
        expect(r.content[0].text.indexOf("不存在") >= 0).toBe(true)
    })

    test("调 list_dir 拿到目录列表（仓库根应包含 packages）", async () => {
        const r: any = await handleToolsCall({
            name: "list_dir",
            arguments: { path: "." }
        })
        expect(r.isError).toBe(undefined)
        expect(r.content[0].text.indexOf("packages") >= 0).toBe(true)
    })

    test("调 read_file 读 README.md 成功（带 maxBytes 触发截断）", async () => {
        const r: any = await handleToolsCall({
            name: "read_file",
            arguments: { path: "README.md", maxBytes: 64 }
        })
        expect(r.isError).toBe(undefined)
        expect(r.content[0].text.indexOf("[截断") >= 0).toBe(true)
    })

    test("read_file 越界路径返回 isError", async () => {
        const r: any = await handleToolsCall({
            name: "read_file",
            arguments: { path: "/etc/passwd" }
        })
        expect(r.isError).toBe(true)
        expect(r.content[0].text.indexOf("越界") >= 0).toBe(true)
    })

    test("run_command 安全命令成功", async () => {
        const r: any = await handleToolsCall({
            name: "run_command",
            arguments: { command: "node", args: ["-e", "console.log('mcp-ok')"], cwd: "." }
        })
        expect(r.isError).toBe(undefined)
        expect(r.content[0].text.indexOf("mcp-ok") >= 0).toBe(true)
    })

    test("run_command 拒绝危险命令", async () => {
        const r: any = await handleToolsCall({
            name: "run_command",
            arguments: { command: "rm", args: ["-rf", "/"] }
        })
        expect(r.isError).toBe(true)
        expect(r.content[0].text.indexOf("拒绝执行") >= 0).toBe(true)
    })

    test("run_command cwd 越界包装成 isError", async () => {
        const r: any = await handleToolsCall({
            name: "run_command",
            arguments: { command: "ls", args: [], cwd: "/etc" }
        })
        expect(r.isError).toBe(true)
        expect(r.content[0].text.indexOf("越界") >= 0).toBe(true)
    })
})

// =============================================================================
// initialize 方法（同步）
// =============================================================================

describe("mcp-server/methods/initialize", () => {

    it("返回协议版本、capabilities、serverInfo", () => {
        const r = handleInitialize({})
        expect(typeof r.protocolVersion).toBe("string")
        expect(r.protocolVersion.length > 0).toBe(true)
        expect(r.capabilities.tools).not.toBe(undefined)
        expect(r.capabilities.resources).not.toBe(undefined)
        expect(typeof r.serverInfo.name).toBe("string")
    })
})

// =============================================================================
// resources/list & resources/read（read 是异步）
// =============================================================================

describe("mcp-server/methods/resources", () => {

    it("list 返回的 resources 至少包含 README.md / package.json", () => {
        const r: any = handleResourcesList({})
        const names = r.resources.map((x: any) => x.name)
        expect(names.indexOf("README.md") >= 0).toBe(true)
        expect(names.indexOf("package.json") >= 0).toBe(true)
    })

    it("list 中 resources 都是 file:// 协议", () => {
        const r: any = handleResourcesList({})
        for (const res of r.resources) {
            expect(res.uri.indexOf("file://") === 0).toBe(true)
        }
    })

    test("read 合法 file URI 返回文件全文", async () => {
        const r: any = await handleResourcesRead({
            uri: "file://" + path.join(REPO_ROOT, "README.md")
        })
        expect(r.contents[0].text.indexOf("Build Your Own Agent") >= 0).toBe(true)
    })

    test("read 非 file:// URI 返回错误提示", async () => {
        const r: any = await handleResourcesRead({ uri: "http://example.com/a" })
        expect(r.contents[0].text.indexOf("file://") >= 0).toBe(true)
    })

    test("read 越界路径返回 '路径越界'", async () => {
        const r: any = await handleResourcesRead({ uri: "file:///etc/passwd" })
        expect(r.contents[0].text.indexOf("越界") >= 0).toBe(true)
    })

    test("read 不存在的文件返回 '文件不存在'", async () => {
        const r: any = await handleResourcesRead({
            uri: "file://" + path.join(REPO_ROOT, "no-such-zzz")
        })
        expect(r.contents[0].text.indexOf("不存在") >= 0).toBe(true)
    })
})

// =============================================================================
// Server：JSON-RPC 分发（混合 sync / async）
// =============================================================================

describe("mcp-server/Server JSON-RPC 分发", () => {

    function makeServer(extra?: (s: Server) => void) {
        const out: any[] = []
        const s = new Server((msg) => out.push(msg))
        if (extra) extra(s)
        return { s, out }
    }

    it("ping 方法返回空对象", async () => {
        const { s, out } = makeServer((srv) => srv.register("ping", () => ({})))
        const req: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "ping" }
        await s.handle(req)
        expect(out.length).toBe(1)
        expect(out[0].id).toBe(1)
        expect(JSON.stringify(out[0].result)).toBe("{}")
    })

    it("未知方法返回 -32601 MethodNotFound", async () => {
        const { s, out } = makeServer()
        const req: JsonRpcRequest = { jsonrpc: "2.0", id: 7, method: "no/such/method" }
        await s.handle(req)
        expect(out[0].error.code).toBe(ErrorCode.MethodNotFound)
        expect(out[0].id).toBe(7)
    })

    it("handler 抛错返回 -32603 InternalError 并带 stack", async () => {
        const { s, out } = makeServer((srv) =>
            srv.register("boom", () => { throw new Error("nope") })
        )
        const req: JsonRpcRequest = { jsonrpc: "2.0", id: 9, method: "boom" }
        await s.handle(req)
        expect(out[0].error.code).toBe(ErrorCode.InternalError)
        expect(out[0].error.message.indexOf("nope") >= 0).toBe(true)
        expect(typeof out[0].error.data).toBe("string")
    })

    it("handler 返回 null 时 result 也为 null（兼容）", async () => {
        const { s, out } = makeServer((srv) => srv.register("nil", () => null))
        const req: JsonRpcRequest = { jsonrpc: "2.0", id: 2, method: "nil" }
        await s.handle(req)
        expect(out[0].result).toBe(null)
    })

    test("通知（无 id）handler 抛错只写 stderr，不返回任何帧", async () => {
        const writes: any[] = []
        const origWrite = process.stderr.write.bind(process.stderr)
        process.stderr.write = ((chunk: any) => { writes.push(String(chunk)); return true }) as any

        try {
            const { s, out } = makeServer((srv) =>
                srv.register("noisy", () => { throw new Error("quiet") })
            )
            const notif: JsonRpcNotification = { jsonrpc: "2.0", method: "noisy" }
            await s.handle(notif)
            expect(out.length).toBe(0)
            expect(writes.length >= 1).toBe(true)
            expect(writes.join("").indexOf("noisy") >= 0).toBe(true)
        } finally {
            process.stderr.write = origWrite as any
        }
    })

    it("notify() 可主动推送通知（无 id）", () => {
        const { s, out } = makeServer()
        s.notify("server/push", { hello: 1 })
        expect(out.length).toBe(1)
        expect(out[0].method).toBe("server/push")
        expect(out[0].params.hello).toBe(1)
        expect(out[0].id).toBe(undefined)
    })

    test("drain() 等待所有 in-flight handle 完成", async () => {
        const { s, out } = makeServer((srv) =>
            srv.register("slow", async () => {
                await new Promise((r) => setTimeout(r, 30))
                return { ok: true }
            })
        )
        const ps: Array<Promise<void>> = []
        for (let i = 0; i < 3; i++) {
            ps.push(s.handle({ jsonrpc: "2.0", id: i, method: "slow" } as JsonRpcRequest))
        }
        await s.drain()
        expect(out.length).toBe(3)
        await Promise.all(ps)
    })
})

// =============================================================================
// 串行 runner：把所有异步测试在框架退出前跑完
// =============================================================================

;(async () => {
    const failures: Array<{ name: string; err: Error }> = []
    for (const c of asyncCases) {
        process.stdout.write(`  🔄 ${c.name} `)
        try {
            await c.run()
            process.stdout.write("✅ 通过\n")
        } catch (e) {
            asyncFailed++
            process.stdout.write("❌ 失败\n")
            failures.push({ name: c.name, err: e as Error })
        }
    }
    asyncDone = true
    if (asyncFailed > 0) {
        console.log(`\n📊 异步测试: ${asyncCases.length - asyncFailed} 通过, ${asyncFailed} 失败`)
        for (const f of failures) {
            console.log(`  ❌ ${f.name}`)
            console.log(`     ${f.err.message}`)
        }
        originalExit(1)
    } else {
        console.log(`\n✅ 异步测试 ${asyncCases.length} 全部通过`)
        originalExit(0)
    }
})()