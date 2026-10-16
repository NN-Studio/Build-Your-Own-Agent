import { execFile } from "child_process"
import * as path from "path"
import { ToolDefinition, ToolCallResult } from "../types"
import { isPathAllowed, repoRoot } from "../sandbox"

// run_command 受限执行：
// - cwd 必须在仓库根 或 packages/*/src 内（白名单）
// - 拒绝危险命令（rm -rf /, sudo, dd, mkfs, :(){:|:&};: 等）
// - 限制超时 30s
// - 限制输出 256KB

const DANGEROUS = [
    /\brm\s+-rf\s+\//,
    /\bsudo\b/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    /:\(\)\s*\{.*\}\s*;:/, // fork bomb
    /\bcurl\s+[^|]*\|\s*(?:bash|sh)/, // curl | sh
    /\bwget\s+[^|]*\|\s*(?:bash|sh)/
]

const MAX_OUTPUT = 256 * 1024
const MAX_TIMEOUT_MS = 30_000

export const run_command: ToolDefinition = {
    name: "run_command",
    description: "在受限 cwd 内执行 shell 命令。cwd 必须在仓库根或 packages/*/src。超时 30s，输出上限 256KB。",
    inputSchema: {
        type: "object",
        properties: {
            command: { type: "string", description: "可执行文件名，如 ls / cat / rg / node" },
            args: {
                type: "array",
                items: { type: "string" },
                description: "参数数组（数组形式更安全，避免 shell 注入）"
            },
            cwd: { type: "string", description: "工作目录，相对仓库根或绝对路径" }
        },
        required: ["command", "args"]
    }
}

export async function run_command_handler(args: {
    command: string
    args: string[]
    cwd?: string
}): Promise<ToolCallResult> {
    const { command, args: cmdArgs, cwd = "." } = args

    if (!command || typeof command !== "string") {
        return { content: [{ type: "text", text: "参数 command 必填" }], isError: true }
    }
    if (!Array.isArray(cmdArgs)) {
        return { content: [{ type: "text", text: "参数 args 必须是字符串数组" }], isError: true }
    }

    // 安全：检查危险模式
    const combined = command + " " + cmdArgs.join(" ")
    for (const re of DANGEROUS) {
        if (re.test(combined)) {
            return {
                content: [{ type: "text", text: `拒绝执行：命中危险模式 ${re}` }],
                isError: true
            }
        }
    }

    if (!isPathAllowed(cwd)) {
        return { content: [{ type: "text", text: `cwd 越界：${cwd}` }], isError: true }
    }

    const absCwd = path.isAbsolute(cwd) ? cwd : path.resolve(repoRoot(), cwd)

    return new Promise<ToolCallResult>((resolve) => {
        execFile(
            command,
            cmdArgs.map(String),
            {
                cwd: absCwd,
                timeout: MAX_TIMEOUT_MS,
                maxBuffer: MAX_OUTPUT,
                shell: false // 关键：不走 shell，杜绝注入
            },
            (err, stdout, stderr) => {
                const out = (stdout || "") + (stderr ? "\n[stderr]\n" + stderr : "")
                const truncated = out.length > MAX_OUTPUT
                    ? out.slice(0, MAX_OUTPUT) + `\n[截断：超过 ${MAX_OUTPUT} 字节]`
                    : out

                if (err) {
                    resolve({
                        content: [{
                            type: "text",
                            text: truncated + `\n[exit=${(err as any).code ?? "?"}]`
                        }],
                        isError: true
                    })
                    return
                }
                resolve({ content: [{ type: "text", text: truncated || "(无输出)" }] })
            }
        )
    })
}