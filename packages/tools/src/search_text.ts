// search_text：按内容正则搜索
// 支持 include 按文件名正则过滤，跳过 node_modules 等

import * as fs from "fs"
import * as path from "path"
import { isPathAllowed, toAbsolute } from "./workdir"

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".cache"])
const MAX_RESULTS = 100

function walk(
    dir: string,
    regex: RegExp,
    includeRegex: RegExp | null,
    results: string[]
): void {
    if (results.length >= MAX_RESULTS) return
    let entries: string[]
    try {
        entries = fs.readdirSync(dir)
    } catch {
        return
    }
    for (const name of entries) {
        if (results.length >= MAX_RESULTS) return
        if (name.startsWith(".")) continue
        const full = path.join(dir, name)
        let stat
        try {
            stat = fs.lstatSync(full)
        } catch {
            continue
        }
        if (stat.isDirectory()) {
            if (SKIP_DIRS.has(name)) continue
            walk(full, regex, includeRegex, results)
        } else if (stat.isFile()) {
            if (includeRegex && !includeRegex.test(name)) continue
            let content: string
            try {
                content = fs.readFileSync(full, { encoding: "utf8" })
            } catch {
                continue
            }
            const lines = content.split("\n")
            for (let i = 0; i < lines.length; i++) {
                if (results.length >= MAX_RESULTS) return
                if (regex.test(lines[i])) {
                    results.push(full + ":" + (i + 1) + ": " + lines[i].trim())
                }
            }
        }
    }
}

function searchFile(
    filePath: string,
    regex: RegExp,
    includeRegex: RegExp | null,
    results: string[]
): void {
    if (includeRegex && !includeRegex.test(filePath)) return
    let content: string
    try {
        content = fs.readFileSync(filePath, { encoding: "utf8" })
    } catch {
        return
    }
    const lines = content.split("\n")
    for (let i = 0; i < lines.length && results.length < MAX_RESULTS; i++) {
        if (regex.test(lines[i])) {
            results.push(filePath + ":" + (i + 1) + ": " + lines[i].trim())
        }
    }
}

export const search_text = {
    description: {
        type: "function",
        function: {
            name: "search_text",
            description: "在文件中搜索文本（支持正则表达式）。递归搜索目录下匹配的行，返回文件路径、行号与内容。会自动跳过 node_modules、.git、dist 等目录。",
            parameters: {
                type: "object",
                properties: {
                    pattern: {
                        type: "string",
                        description: "搜索的正则表达式或文本",
                    },
                    path: {
                        type: "string",
                        description: "搜索的目录或文件路径，相对仓库根或绝对路径，默认为仓库根",
                    },
                    include: {
                        type: "string",
                        description: "只搜索文件名匹配此正则的文件，例如 \\\\.ts$ 只搜索 ts 文件",
                    },
                },
                required: ["pattern"],
            },
        },
    },
    valueOf: async function (args: { pattern: string; path?: string; include?: string }) {
        if (!args.pattern || typeof args.pattern !== "string") return "错误：参数 pattern 必填"

        const target = args.path || "."
        if (!isPathAllowed(target)) return "错误：路径越界（" + target + "）"

        const abs = toAbsolute(target)
        if (!fs.existsSync(abs)) return "错误：路径不存在：" + abs

        let regex: RegExp
        let includeRegex: RegExp | null = null
        try {
            regex = new RegExp(args.pattern)
        } catch (e) {
            return "错误：pattern 不是合法的正则表达式：" + (e as Error).message
        }
        if (args.include) {
            try {
                includeRegex = new RegExp(args.include)
            } catch (e) {
                return "错误：include 不是合法的正则表达式：" + (e as Error).message
            }
        }

        const results: string[] = []
        const stat = fs.lstatSync(abs)
        if (stat.isFile()) {
            searchFile(abs, regex, includeRegex, results)
        } else {
            walk(abs, regex, includeRegex, results)
        }

        if (results.length === 0) return "未找到匹配内容"
        let text = results.join("\n")
        if (results.length >= MAX_RESULTS) {
            text += "\n...（结果已达上限 " + MAX_RESULTS + " 条，请缩小搜索范围或细化 pattern）"
        }
        return text
    },
}