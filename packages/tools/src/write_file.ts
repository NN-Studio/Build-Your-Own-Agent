// write_file：创建或覆盖文件

import * as fs from "fs"
import * as path from "path"
import { isPathAllowed, toAbsolute } from "./workdir"

export const write_file = {
    description: {
        type: "function",
        function: {
            name: "write_file",
            description: "创建或覆盖一个文件。会自动创建不存在的父目录。如果文件已存在，原有内容会被完整覆盖，请确保传入完整的文件内容。",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "需要写入的文件路径，相对仓库根或绝对路径",
                    },
                    content: {
                        type: "string",
                        description: "需要写入的完整文件内容",
                    },
                },
                required: ["path", "content"],
            },
        },
    },
    valueOf: async function (args: { path: string; content: string }) {
        if (!args.path || typeof args.path !== "string") return "错误：参数 path 必填"
        if (typeof args.content !== "string") return "错误：参数 content 必须是字符串"

        if (!isPathAllowed(args.path)) return "错误：路径越界（" + args.path + "）"

        const abs = toAbsolute(args.path)
        // 自动创建父目录
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        fs.writeFileSync(abs, args.content, { encoding: "utf8" })

        return "文件写入成功：" + abs + "（" + args.content.length + " 字符）"
    },
}