// list_dir：列出目录下文件/子目录（不递归）
// （callFuns 会把结果塞进 tool role 的 content，LLM 只看 string）

import * as fs from "fs"
import * as path from "path"
import { isPathAllowed, toAbsolute } from "./workdir"

export const list_dir = {
    description: {
        type: "function",
        function: {
            name: "list_dir",
            description: "列出目录中的文件和子目录，返回名称、类型（directory/file）和大小。用于查看目录结构、定位模块。不递归。",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "需要列出的目录路径，相对仓库根或绝对路径，默认为仓库根",
                    },
                },
                required: [],
            },
        },
    },
    valueOf: async function (args: { path?: string }) {
        const target = args.path || "."
        if (!isPathAllowed(target)) {
            return "错误：路径越界，仅允许访问仓库内（" + target + "）"
        }
        const abs = toAbsolute(target)
        if (!fs.existsSync(abs)) return "错误：路径不存在：" + abs
        const stat = fs.statSync(abs)
        if (!stat.isDirectory()) return "错误：不是目录：" + abs

        const entries = fs.readdirSync(abs)
        const items = entries.map((name) => {
            const full = path.join(abs, name)
            let s: fs.Stats
            try {
                s = fs.lstatSync(full)
            } catch {
                return { name, type: "unknown", size: 0 }
            }
            return {
                name,
                type: s.isDirectory() ? "directory" : "file",
                size: s.size,
            }
        })
        // 目录在前，同类型按名字排
        items.sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1
            return a.name.localeCompare(b.name)
        })
        return JSON.stringify(items)
    },
}