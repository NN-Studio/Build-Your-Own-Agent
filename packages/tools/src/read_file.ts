// read_file：读取文本文件

import * as fs from "fs"
import { isPathAllowed, toAbsolute } from "./workdir"

const DEFAULT_MAX_BYTES = 1024 * 1024 // 1MB

export const read_file = {
    description: {
        type: "function",
        function: {
            name: "read_file",
            description: "读取文本文件的内容，用于查看源码、配置等文本文件。超过 maxBytes 会被截断，默认 1MB。",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "需要读取的文件路径，相对仓库根或绝对路径",
                    },
                    maxBytes: {
                        type: "number",
                        description: "最大读取字节数，默认 1048576 (1MB)",
                    },
                },
                required: ["path"],
            },
        },
    },
    valueOf: async function (args: { path: string; maxBytes?: number }) {
        const p = args.path
        const maxBytes = args.maxBytes ?? DEFAULT_MAX_BYTES

        if (!p || typeof p !== "string") return "错误：参数 path 必填"
        if (!isPathAllowed(p)) return "错误：路径越界（" + p + "）"

        const abs = toAbsolute(p)
        if (!fs.existsSync(abs)) return "错误：文件不存在：" + abs
        const stat = fs.statSync(abs)
        if (stat.isDirectory()) return "错误：这是一个目录而非文件：" + abs

        const buf = fs.readFileSync(abs)
        if (buf.length > maxBytes) {
            return buf.subarray(0, maxBytes).toString("utf8") +
                "\n\n[截断：超过 " + maxBytes + " 字节]"
        }
        return buf.toString("utf8")
    },
}