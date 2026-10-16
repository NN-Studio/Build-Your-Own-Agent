// run_command：在受限 cwd 内执行 shell 命令
// 使用 execFile + shell:false，杜绝 shell 注入

import { execFile } from "child_process"
import { isPathAllowed, toAbsolute } from "./workdir"

const DANGEROUS = [
    /\brm\s+-rf\s+\//,
    /\bsudo\b/,
    /\bmkfs\b/,
    /\bdd\s+if=/,
    /:\(\)\s*\{.*\}\s*;:/, // fork bomb
    /\bcurl\s+[^|]*\|\s*(?:bash|sh)/, // curl | sh
    /\bwget\s+[^|]*\|\s*(?:bash|sh)/,
]

const MAX_OUTPUT = 256 * 1024
const MAX_TIMEOUT_MS = 30_000

export const run_command = {
    description: {
        type: "function",
        function: {
            name: "run_command",
            description: "在受限 cwd 内执行命令。cwd 必须在仓库内，超时 30 秒，输出上限 256KB。拒绝危险命令（rm -rf /、sudo、mkfs、dd、fork bomb、curl|sh 等）。",
            parameters: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: "可执行文件名，例如 ls / rg / cat / node",
                    },
                    args: {
                        type: "array",
                        items: { type: "string" },
                        description: "参数数组（数组形式更安全，避免 shell 注入）",
                    },
                    cwd: {
                        type: "string",
                        description: "工作目录，相对仓库根或绝对路径，默认为仓库根",
                    },
                },
                required: ["command", "args"],
            },
        },
    },
    valueOf: async function (args: { command: string; args: string[]; cwd?: string }) {
        if (!args.command || typeof args.command !== "string") return "错误：参数 command 必填"
        if (!Array.isArray(args.args)) return "错误：参数 args 必须是字符串数组"

        // 危险模式拦截
        const combined = args.command + " " + args.args.join(" ")
        for (const re of DANGEROUS) {
            if (re.test(combined)) {
                return "拒绝执行：命中危险模式 " + re
            }
        }

        const cwd = args.cwd || "."
        if (!isPathAllowed(cwd)) return "错误：cwd 越界（" + cwd + "）"
        const absCwd = toAbsolute(cwd)

        return await new Promise<string>((resolve) => {
            execFile(
                args.command,
                args.args.map(String),
                {
                    cwd: absCwd,
                    timeout: MAX_TIMEOUT_MS,
                    maxBuffer: MAX_OUTPUT,
                    shell: false,
                },
                (err, stdout, stderr) => {
                    const out = (stdout || "") + (stderr ? "\n[stderr]\n" + stderr : "")
                    const truncated = out.length > MAX_OUTPUT
                        ? out.slice(0, MAX_OUTPUT) + "\n[截断：超过 " + MAX_OUTPUT + " 字节]"
                        : out

                    if (err) {
                        resolve(truncated + "\n[exit=" + ((err as any).code ?? "?") + "]")
                        return
                    }
                    resolve(truncated || "(无输出)")
                }
            )
        })
    },
}