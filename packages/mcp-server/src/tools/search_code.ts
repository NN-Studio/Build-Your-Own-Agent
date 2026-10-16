import { execFile } from "child_process"
import * as path from "path"
import { ToolDefinition, ToolCallResult } from "../types"
import { isPathAllowed, repoRoot } from "../sandbox"

// 用 ripgrep（若不可用则回退到 node 自带的递归 grep）
export const search_code: ToolDefinition = {
    name: "search_code",
    description: "在指定目录下用正则搜索文本。默认用 ripgrep（rg），若不可用则回退到 node 实现。",
    inputSchema: {
        type: "object",
        properties: {
            query: { type: "string", description: "正则字符串" },
            path: { type: "string", description: "搜索根目录，相对仓库根或绝对路径" },
            glob: { type: "string", description: "可选，glob 过滤，如 *.ts" },
            maxResults: { type: "number", description: "最大返回条数，默认 100" }
        },
        required: ["query"]
    }
}

export async function search_code_handler(args: {
    query: string
    path?: string
    glob?: string
    maxResults?: number
}): Promise<ToolCallResult> {
    const { query, path: searchPath = ".", glob, maxResults = 100 } = args

    if (!query || typeof query !== "string") {
        return { content: [{ type: "text", text: "参数 query 必填" }], isError: true }
    }

    if (!isPathAllowed(searchPath)) {
        return { content: [{ type: "text", text: `路径越界：${searchPath}` }], isError: true }
    }

    const abs = path.isAbsolute(searchPath) ? searchPath : path.resolve(repoRoot(), searchPath)

    // 先尝试 rg
    const rgResult = await runRg(query, abs, glob)
    if (rgResult !== null) {
        return formatResult(rgResult, maxResults)
    }

    // 回退：node 自带的递归 grep（按 glob 过滤 .ts/.tsx/.js/.json/.md）
    const fallback = nodeGrep(query, abs, glob)
    return formatResult(fallback, maxResults)
}

function runRg(query: string, cwd: string, glob?: string): Promise<string | null> {
    return new Promise((resolve) => {
        const args = ["--line-number", "--no-heading", "--color=never"]
        if (glob) args.push("--glob", glob)
        args.push(query, ".")

        execFile("rg", args, { cwd, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, _stderr) => {
            if (err && (err as any).code === "ENOENT") {
                resolve(null) // rg 不存在
                return
            }
            // rg 找不到匹配时 exit code = 1，但 stdout 仍可能为空，err != null
            resolve(stdout || "")
        })
    })
}

function nodeGrep(query: string, rootDir: string, glob?: string): string {
    const fs = require("fs") as typeof import("fs")
    const re = new RegExp(query)
    const defaultExts = new Set([".ts", ".tsx", ".js", ".json", ".md"])
    const out: string[] = []

    function walk(dir: string) {
        let entries: any[]
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
            return
        }
        for (const e of entries) {
            const full = path.join(dir, e.name)
            if (e.isDirectory()) {
                if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue
                walk(full)
            } else if (e.isFile()) {
                const ext = path.extname(e.name).toLowerCase()
                if (glob) {
                    // 简易 glob：只支持 *.ext
                    const want = glob.replace(/^\*\.?/, "")
                    if (path.extname(e.name).slice(1) !== want) continue
                } else if (!defaultExts.has(ext)) {
                    continue
                }
                let text: string
                try {
                    text = fs.readFileSync(full, "utf8")
                } catch {
                    continue
                }
                text.split(/\r?\n/).forEach((line, i) => {
                    if (re.test(line)) {
                        out.push(`${full}:${i + 1}:${line}`)
                    }
                })
            }
        }
    }

    walk(rootDir)
    return out.join("\n")
}

function formatResult(stdout: string, maxResults: number): ToolCallResult {
    if (!stdout.trim()) {
        return { content: [{ type: "text", text: "(无匹配)" }] }
    }
    const lines = stdout.split(/\r?\n/).filter(Boolean)
    if (lines.length > maxResults) {
        return {
            content: [{
                type: "text",
                text: lines.slice(0, maxResults).join("\n") + `\n\n[截断：共 ${lines.length} 条，仅显示前 ${maxResults} 条]`
            }]
        }
    }
    return { content: [{ type: "text", text: stdout }] }
}