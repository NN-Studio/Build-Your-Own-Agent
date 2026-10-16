// stdio 传输层：按行解析 stdin，把每行 JSON 帧回调出去
// 重要：输出必须走 stdout.write，绝不能用 console.log（会污染协议流）

import * as readline from "readline"
import { JsonRpcFrame, JsonRpcSuccess, JsonRpcError, JsonRpcNotification, ErrorCode } from "./types"

export type FrameHandler = (frame: JsonRpcFrame) => void

export class StdioTransport {
    private rl: readline.Interface
    private drainFn: (() => Promise<void>) | null = null

    constructor(onFrame: FrameHandler) {
        this.rl = readline.createInterface({
            input: process.stdin,
            crlfDelay: Infinity
        })

        this.rl.on("line", (line) => {
            const trimmed = line.trim()
            if (!trimmed) return

            try {
                const frame = JSON.parse(trimmed) as JsonRpcFrame
                onFrame(frame)
            } catch (e) {
                // 解析失败也要返回 -32700 错误帧（id 未知所以为 null）
                this.write({
                    jsonrpc: "2.0",
                    id: null,
                    error: {
                        code: ErrorCode.ParseError,
                        message: "Parse error",
                        data: String(e)
                    }
                })
            }
        })

        this.rl.on("close", async () => {
            // stdin 关闭时，先排空 server 未完成的请求，再退出
            if (this.drainFn) {
                try {
                    await this.drainFn()
                } catch {
                    // ignore
                }
            }
            process.exit(0)
        })
    }

    // Server 调用此方法注册 drain 回调
    onClose(fn: () => Promise<void>): void {
        this.drainFn = fn
    }

    // 主动发送响应/通知
    write(message: JsonRpcSuccess | JsonRpcError | JsonRpcNotification): void {
        process.stdout.write(JSON.stringify(message) + "\n")
    }

    close(): void {
        this.rl.close()
    }
}