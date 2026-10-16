// edit_file：精确替换文件中的某段内容

import * as fs from "fs"
import { isPathAllowed, toAbsolute } from "./workdir"

export const edit_file = {
    description: {
        type: "function",
        function: {
            name: "edit_file",
            description: "精确替换文件中的某段内容。通过 oldString 定位要修改的文本，用 newString 替换。要求 oldString 与文件中的内容完全一致（包括缩进和换行）。若 oldString 在文件中出现多次，需要提供更长的上下文使其唯一，或设置 replaceAll 为 true 替换全部。",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "需要修改的文件路径",
                    },
                    oldString: {
                        type: "string",
                        description: "需要被替换的原文本，必须与文件中内容完全一致（包括缩进和换行）",
                    },
                    newString: {
                        type: "string",
                        description: "替换后的新文本",
                    },
                    replaceAll: {
                        type: "boolean",
                        description: "是否替换所有匹配项，默认为 false",
                    },
                },
                required: ["path", "oldString", "newString"],
            },
        },
    },
    valueOf: async function (args: {
        path: string
        oldString: string
        newString: string
        replaceAll?: boolean
    }) {
        if (!args.path || typeof args.path !== "string") return "错误：参数 path 必填"
        if (typeof args.oldString !== "string") return "错误：参数 oldString 必填"
        if (typeof args.newString !== "string") return "错误：参数 newString 必填"

        if (!isPathAllowed(args.path)) return "错误：路径越界（" + args.path + "）"

        const abs = toAbsolute(args.path)
        if (!fs.existsSync(abs)) return "错误：文件不存在：" + abs
        const stat = fs.statSync(abs)
        if (stat.isDirectory()) return "错误：这是一个目录而非文件：" + abs

        const content = fs.readFileSync(abs, { encoding: "utf8" })
        const count = content.split(args.oldString).length - 1

        if (count === 0) {
            return "错误：oldString 在文件中未找到，请检查内容是否完全一致（包括缩进和换行）"
        }
        if (count > 1 && !args.replaceAll) {
            return "错误：oldString 在文件中出现 " + count + " 次，不唯一。请提供更长的上下文使其唯一，或设置 replaceAll 为 true"
        }

        let newContent: string
        if (args.replaceAll) {
            newContent = content.split(args.oldString).join(args.newString)
        } else {
            newContent = content.replace(args.oldString, args.newString)
        }

        fs.writeFileSync(abs, newContent, { encoding: "utf8" })
        return "文件修改成功：" + abs + "（替换了 " + (args.replaceAll ? count : 1) + " 处）"
    },
}