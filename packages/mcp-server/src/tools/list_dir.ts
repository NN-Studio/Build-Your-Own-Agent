import * as fs from "fs"
import * as path from "path"
import { ToolDefinition, ToolCallResult } from "../types"
import { isPathAllowed, repoRoot } from "../sandbox"

export const list_dir: ToolDefinition = {
    name: "list_dir",
    description: "列出目录下文件/子目录（不递归）。",
    inputSchema: {
        type: "object",
        properties: {
            path: { type: "string", description: "目录路径，相对仓库根或绝对路径" }
        },
        required: ["path"]
    }
}

export async function list_dir_handler(args: { path: string }): Promise<ToolCallResult> {
    const { path: p } = args

    if (!p || typeof p !== "string") {
        return { content: [{ type: "text", text: "参数 path 必填" }], isError: true }
    }

    if (!isPathAllowed(p)) {
        return { content: [{ type: "text", text: `路径越界：${p}` }], isError: true }
    }

    const abs = path.isAbsolute(p) ? p : path.resolve(repoRoot(), p)

    if (!fs.existsSync(abs)) {
        return { content: [{ type: "text", text: `目录不存在：` + abs }], isError: true }
    }

    if (!fs.statSync(abs).isDirectory()) {
        return { content: [{ type: "text", text: `不是目录：` + abs }], isError: true }
    }

    const entries = fs.readdirSync(abs, { withFileTypes: true })
    const lines = entries
        .map((e) => (e.isDirectory() ? `[DIR]  ${e.name}` : `[FILE] ${e.name}`))
        .sort()
        .join("\n")

    return { content: [{ type: "text", text: lines || "(空目录)" }] }
}