import { Unit } from "@oipage/testjs"
import * as path from "path"
import * as fs from "fs"

import { list_dir } from "../packages/tools/src/list_dir"
import { read_file } from "../packages/tools/src/read_file"
import { write_file } from "../packages/tools/src/write_file"
import { edit_file } from "../packages/tools/src/edit_file"
import { search_code } from "../packages/tools/src/search_code"
import { search_text } from "../packages/tools/src/search_text"
import { run_command } from "../packages/tools/src/run_command"
import { isPathAllowed, isInPackagesSrc, repoRoot } from "../packages/tools/src/workdir"

const { describe, it, expect } = Unit.node()

const SANDBOX_DIR = path.join(repoRoot(), ".cache", "tools-spec")
const TARGET_FILE = path.join(SANDBOX_DIR, "demo.txt")

fs.mkdirSync(SANDBOX_DIR, { recursive: true })
process.on("beforeExit", () => {
    try { fs.rmSync(SANDBOX_DIR, { recursive: true, force: true }) } catch { /* ignore */ }
})

// @oipage/testjs 的 Unit.node() 在 it(name, fn) 里同步调用 fn()，
// 并不 await async 函数——这会让多个异步测试互相乱序执行。
// 这里用一个最小化的串行 runner 来执行所有异步测试，
// 保证"前一个测试彻底完成后再跑下一个"，且失败能被框架感知。
type Case = { name: string; run: () => void | Promise<void> }
const asyncCases: Case[] = []

function test(name: string, run: () => void | Promise<void>) {
    // 同步测试：直接交给框架；异步测试：登记到 asyncCases
    if (run.constructor.name === "AsyncFunction") {
        asyncCases.push({ name, run })
    } else {
        it(name, run as () => void)
    }
}

// =============================================================================
// 沙箱：路径白名单（同步）
// =============================================================================

describe("tools/workdir 沙箱", () => {

    it("仓库内相对路径放行", () => {
        expect(isPathAllowed("packages/tools/src")).toBe(true)
        expect(isPathAllowed("config.ts")).toBe(true)
    })

    it("仓库内绝对路径放行", () => {
        expect(isPathAllowed(repoRoot())).toBe(true)
    })

    it("仓库外的相对路径（.. 逃逸）拒绝", () => {
        expect(isPathAllowed("../etc")).toBe(false)
        expect(isPathAllowed("packages/../../etc/passwd")).toBe(false)
    })

    it("仓库外的绝对路径拒绝", () => {
        expect(isPathAllowed("/etc/passwd")).toBe(false)
        expect(isPathAllowed("/tmp")).toBe(false)
    })

    it("空字符串与非字符串返回 false", () => {
        expect(isPathAllowed("")).toBe(false)
        // @ts-expect-error 测试非法入参
        expect(isPathAllowed(null)).toBe(false)
    })

    it("isInPackagesSrc 仅匹配 packages/*/src", () => {
        expect(isInPackagesSrc("packages/tools/src/index.ts")).toBe(true)
        expect(isInPackagesSrc("packages/tools/package.json")).toBe(false)
        expect(isInPackagesSrc("src/index.ts")).toBe(false)
    })
})

// =============================================================================
// list_dir
// =============================================================================

describe("tools/list_dir", () => {

    test("列目录返回 JSON 数组，目录在前文件在后", async () => {
        fs.mkdirSync(path.join(SANDBOX_DIR, "list-demo"), { recursive: true })
        fs.writeFileSync(path.join(SANDBOX_DIR, "list-demo", "a.txt"), "x")

        const rel = path.relative(repoRoot(), SANDBOX_DIR)
        const out = await list_dir.valueOf({ path: path.join(rel, "list-demo") })
        const items = JSON.parse(out as string)

        expect(Array.isArray(items)).toBe(true)
        const names = items.map((i: any) => i.name)
        expect(names.indexOf("a.txt") >= 0).toBe(true)
    })

    test("路径越界返回错误信息", async () => {
        const out = await list_dir.valueOf({ path: "/etc" })
        expect(String(out).indexOf("路径越界") >= 0).toBe(true)
    })

    test("路径不存在返回错误信息", async () => {
        const out = await list_dir.valueOf({ path: "no-such-path-zzz" })
        expect(String(out).indexOf("路径不存在") >= 0).toBe(true)
    })

    test("对文件调用返回 '不是目录'", async () => {
        const out = await list_dir.valueOf({ path: "config.ts" })
        expect(String(out).indexOf("不是目录") >= 0).toBe(true)
    })
})

// =============================================================================
// read_file
// =============================================================================

describe("tools/read_file", () => {

    test("相对路径读取仓库内文本", async () => {
        fs.writeFileSync(TARGET_FILE, "hello\nworld\n", "utf8")
        const rel = path.relative(repoRoot(), TARGET_FILE)
        const out = await read_file.valueOf({ path: rel })
        expect(String(out)).toBe("hello\nworld\n")
    })

    test("路径越界返回错误", async () => {
        const out = await read_file.valueOf({ path: "/etc/passwd" })
        expect(String(out).indexOf("路径越界") >= 0).toBe(true)
    })

    test("缺 path 报错", async () => {
        // @ts-expect-error 故意漏参
        const out = await read_file.valueOf({})
        expect(String(out).indexOf("必填") >= 0).toBe(true)
    })

    test("对目录报错 '这是一个目录而非文件'", async () => {
        const out = await read_file.valueOf({ path: "packages/tools/src" })
        expect(String(out).indexOf("目录而非文件") >= 0).toBe(true)
    })

    test("maxBytes 截断：超过的部分被丢掉", async () => {
        fs.writeFileSync(TARGET_FILE, "hello\nworld\n", "utf8")
        const rel = path.relative(repoRoot(), TARGET_FILE)
        const out = await read_file.valueOf({ path: rel, maxBytes: 5 })
        expect(String(out).startsWith("hello")).toBe(true)
        expect(String(out).indexOf("截断") >= 0).toBe(true)
    })
})

// =============================================================================
// write_file / edit_file
// =============================================================================

describe("tools/write_file + edit_file", () => {

    const WRITE_PATH = path.join(SANDBOX_DIR, "write-edit", "note.txt")
    const rel = path.relative(repoRoot(), WRITE_PATH)

    test("write_file 创建不存在的父目录", async () => {
        const r = await write_file.valueOf({ path: rel, content: "alpha\nbeta\n" })
        expect(String(r).indexOf("写入成功") >= 0).toBe(true)
        expect(fs.readFileSync(WRITE_PATH, "utf8")).toBe("alpha\nbeta\n")
    })

    test("write_file 覆盖已有内容", async () => {
        await write_file.valueOf({ path: rel, content: "new" })
        expect(fs.readFileSync(WRITE_PATH, "utf8")).toBe("new")
    })

    test("edit_file 精确替换唯一片段", async () => {
        await write_file.valueOf({ path: rel, content: "alpha\nbeta\ngamma\n" })
        const r = await edit_file.valueOf({
            path: rel,
            oldString: "beta",
            newString: "BETA"
        })
        expect(String(r).indexOf("修改成功") >= 0).toBe(true)
        expect(fs.readFileSync(WRITE_PATH, "utf8")).toBe("alpha\nBETA\ngamma\n")
    })

    test("edit_file 多处匹配且未传 replaceAll 时报错", async () => {
        await write_file.valueOf({ path: rel, content: "x\nx\nx\n" })
        const r = await edit_file.valueOf({
            path: rel,
            oldString: "x",
            newString: "y"
        })
        expect(String(r).indexOf("不唯一") >= 0).toBe(true)
    })

    test("edit_file replaceAll=true 全部替换", async () => {
        await write_file.valueOf({ path: rel, content: "x\nx\nx\n" })
        const r = await edit_file.valueOf({
            path: rel,
            oldString: "x",
            newString: "y",
            replaceAll: true
        })
        expect(String(r).indexOf("修改成功") >= 0).toBe(true)
        expect(fs.readFileSync(WRITE_PATH, "utf8")).toBe("y\ny\ny\n")
    })

    test("edit_file oldString 找不到时报错", async () => {
        await write_file.valueOf({ path: rel, content: "abc" })
        const r = await edit_file.valueOf({
            path: rel,
            oldString: "xyz",
            newString: "Q"
        })
        expect(String(r).indexOf("未找到") >= 0).toBe(true)
    })

    test("write_file 越界路径返回错误", async () => {
        const r = await write_file.valueOf({ path: "/tmp/blocked", content: "x" })
        expect(String(r).indexOf("路径越界") >= 0).toBe(true)
    })
})

// =============================================================================
// search_code / search_text
// =============================================================================

describe("tools/search_code + search_text", () => {

    test("search_code 按文件名正则匹配 .ts", async () => {
        const out = await search_code.valueOf({ pattern: "read_file\\.ts$", path: "packages/tools/src" })
        expect(String(out).indexOf("read_file.ts") >= 0).toBe(true)
    })

    test("search_code 没匹配返回 '未找到匹配文件'", async () => {
        const out = await search_code.valueOf({ pattern: "^no_such_file_zzz$" })
        expect(String(out)).toBe("未找到匹配文件")
    })

    test("search_code 非法正则报错", async () => {
        const out = await search_code.valueOf({ pattern: "(" })
        expect(String(out).indexOf("正则表达式") >= 0).toBe(true)
    })

    test("search_code 缺 pattern 报错", async () => {
        // @ts-expect-error
        const out = await search_code.valueOf({})
        expect(String(out).indexOf("必填") >= 0).toBe(true)
    })

    test("search_text 按内容搜行级匹配", async () => {
        const out = await search_text.valueOf({ pattern: "isPathAllowed", path: "packages/tools/src" })
        expect(String(out).indexOf("workdir.ts") >= 0).toBe(true)
    })

    test("search_text include 按扩展名过滤", async () => {
        const out = await search_text.valueOf({
            pattern: "isPathAllowed",
            path: "packages/tools/src",
            include: "\\.ts$"
        })
        expect(String(out).indexOf(".ts") >= 0).toBe(true)
    })

    test("search_text 越界路径报错", async () => {
        const out = await search_text.valueOf({ pattern: "x", path: "/etc" })
        expect(String(out).indexOf("路径越界") >= 0).toBe(true)
    })
})

// =============================================================================
// run_command
// =============================================================================

describe("tools/run_command", () => {

    test("安全命令正常返回", async () => {
        const out = await run_command.valueOf({
            command: "node",
            args: ["-e", "console.log('hi-from-node')"],
            cwd: "."
        })
        expect(String(out).indexOf("hi-from-node") >= 0).toBe(true)
    })

    test("拒绝危险模式：rm -rf /", async () => {
        const out = await run_command.valueOf({
            command: "rm",
            args: ["-rf", "/"]
        })
        expect(String(out).indexOf("拒绝执行") >= 0).toBe(true)
    })

    test("拒绝危险模式：sudo", async () => {
        const out = await run_command.valueOf({
            command: "sudo",
            args: ["ls"]
        })
        expect(String(out).indexOf("拒绝执行") >= 0).toBe(true)
    })

    test("拒绝危险模式：fork bomb", async () => {
        const out = await run_command.valueOf({
            command: ":()",
            args: ["{", ":|:&", "};:"]
        })
        expect(String(out).indexOf("拒绝执行") >= 0).toBe(true)
    })

    test("cwd 越界返回错误", async () => {
        const out = await run_command.valueOf({
            command: "ls",
            args: [],
            cwd: "/etc"
        })
        expect(String(out).indexOf("cwd 越界") >= 0).toBe(true)
    })

    test("args 非数组报错", async () => {
        // @ts-expect-error
        const out = await run_command.valueOf({ command: "ls", args: "not-array" })
        expect(String(out).indexOf("字符串数组") >= 0).toBe(true)
    })

    test("exit 非 0 时仍返回 exit code", async () => {
        const out = await run_command.valueOf({
            command: "node",
            args: ["-e", "process.exit(7)"],
            cwd: "."
        })
        expect(String(out).indexOf("exit=7") >= 0).toBe(true)
    })
})

// =============================================================================
// 串行 runner：把所有异步测试在框架退出前跑完
// =============================================================================

// 拦截框架的成功退出：框架在 beforeExit 里如果 failedTests === 0
// 会调用 process.exit(0)，但那时我们的异步测试还没开始跑。
// 我们用一个标志位跟踪"异步是否跑完"，仅当跑完才允许退出。
let asyncDone = false
let asyncFailed = 0
const originalExit = process.exit.bind(process)
;(process as any).exit = (code?: number) => {
    if (code === 0 && !asyncDone) {
        // 阻止框架的成功退出，等异步跑完
        return
    }
    originalExit(code as any)
}

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