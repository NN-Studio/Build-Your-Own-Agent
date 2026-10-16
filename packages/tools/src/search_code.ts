// search_code：按文件名正则搜索
// 跳过 node_modules / .git / dist / build / .cache / 隐藏目录

import * as fs from "fs"
import * as path from "path"
import { isPathAllowed, toAbsolute } from "./workdir"

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".cache"])
const MAX_RESULTS = 100

function walk(dir: string, regex: RegExp, results: string[]): void {
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
            walk(full, regex, results)
        } else if (stat.isFile()) {
            if (regex.test(name)) results.push(full)
        }
    }
}

export const search_code = {
    description: {
        type: "function",
        function: {
            name: "search_code",
            description: "按文件名搜索文件（支持正则表达式）。递归搜索目录下文件名匹配的文件完整路径。会自动跳过 node_modules、.git、dist 等目录。",
            parameters: {
                type: "object",
                properties: {
                    pattern: {
                        type: "string",
                        description: "文件名匹配的正则表达式，例如 \\\\.test\\\\.ts$ 查找测试文件",
                    },
                    path: {
                        type: "string",
                        description: "搜索的根目录，相对仓库根或绝对路径，默认为仓库根",
                    },
                },
                required: ["pattern"],
            },
        },
    },
    valueOf: async function (args: { pattern: string; path?: string }) {
        if (!args.pattern || typeof args.pattern !== "string") return "错误：参数 pattern 必填"

        const target = args.path || "."
        if (!isPathAllowed(target)) return "错误：路径越界（" + target + "）"

        const abs = toAbsolute(target)
        if (!fs.existsSync(abs)) return "错误：路径不存在：" + abs

        let regex: RegExp
        try {
            regex = new RegExp(args.pattern)
        } catch (e) {
            return "错误：pattern 不是合法的正则表达式：" + (e as Error).message
        }

        const results: string[] = []
        walk(abs, regex, results)

        if (results.length === 0) return "未找到匹配文件"
        let text = results.join("\n")
        if (results.length >= MAX_RESULTS) {
            text += "\n...（结果已达上限 " + MAX_RESULTS + " 条，请缩小搜索范围或细化 pattern）"
        }
        return text
    },
}