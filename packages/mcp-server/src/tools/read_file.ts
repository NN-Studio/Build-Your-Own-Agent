import * as fs from "fs"
import * as path from "path"
import { ToolDefinition, ToolCallResult } from "../types"
import { isPathAllowed, repoRoot } from "../sandbox"

export const read_file: ToolDefinition = {
    name: "read_file",
    description: "读取仓库内任意文本文件。path 相对于仓库根或绝对路径。",
    inputSchema: {
        type: "object",
        properties: {
            path: { type: "string", description: "文件路径，相对仓库根或绝对路径" },
            maxBytes: { type: "number", description: "最大读取字节数，默认 1MB" }
        },
        required: ["path"]
    }
}

export async function read_file_handler(args: { path: string; maxBytes?: number }): Promise<ToolCallResult> {
    const { path: p, maxBytes = 1024 * 1024 } = args

    if (!p || typeof p !== "string") {
        return { content: [{ type: "text", text: "参数 path 必填" }], isError: true }
    }

    if (!isPathAllowed(p)) {
        return { content: [{ type: "text", text: `路径越界：${p}` }], isError: true }
    }

    const abs = path.isAbsolute(p) ? p : path.resolve(repoRoot(), p)

    if (!fs.existsSync(abs)) {
        return { content: [{ type: "text", text: `文件不存在：` + abs }], isError: true }
    }

    const stat = fs.statSync(abs)
    if (stat.isDirectory()) {
        return { content: [{ type: "text", text: `这是一个目录而非文件：` + abs }], isError: true }
    }

    const buf = fs.readFileSync(abs)
    let text: string
    if (buf.length > maxBytes) {
        text = buf.subarray(0, maxBytes).toString("utf8") + `\n\n[截断：超过 ${maxBytes} 字节]`
    } else {
        text = buf.toString("utf8")
    }

    return { content: [{ type: "text", text }] }
}