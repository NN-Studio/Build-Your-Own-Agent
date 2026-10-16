// MCP Server 核心：方法注册表 + JSON-RPC 分发
// 1. 收到 request → 查表 → handler → 返回 result
// 2. 收到 notification → 静默处理，不返回
// 3. handler 抛错 → 包装成 -32603 错误帧

import {
    JsonRpcFrame,
    JsonRpcRequest,
    JsonRpcNotification,
    ErrorCode,
    JsonRpcSuccess,
    JsonRpcError
} from "./types"

export type MethodHandler = (params: any) => Promise<any> | any
export type FrameWriter = (msg: JsonRpcSuccess | JsonRpcError | JsonRpcNotification) => void

export class Server {
    private methods: Map<string, MethodHandler> = new Map()
    private writer: FrameWriter
    private pending: Set<Promise<any>> = new Set()

    constructor(writer: FrameWriter) {
        this.writer = writer
    }

    // 注册方法
    register(method: string, handler: MethodHandler): void {
        this.methods.set(method, handler)
    }

    // 入口：处理每一帧（异步、可并发）
    handle(frame: JsonRpcFrame): Promise<void> {
        const p = this._handle(frame)
        this.pending.add(p)
        p.finally(() => this.pending.delete(p))
        return p
    }

    private async _handle(frame: JsonRpcFrame): Promise<void> {
        // 通知：没有 id 字段
        const isRequest = "id" in (frame as any)

        if (!isRequest) {
            const notif = frame as JsonRpcNotification
            const handler = this.methods.get(notif.method)
            if (handler) {
                try {
                    await handler(notif.params)
                } catch (e) {
                    // 通知错误只记日志，不返回
                    process.stderr.write(`[mcp-server] notification ${notif.method} failed: ${e}\n`)
                }
            }
            return
        }

        const req = frame as JsonRpcRequest
        const handler = this.methods.get(req.method)

        // 方法不存在
        if (!handler) {
            this.respondError(req.id, ErrorCode.MethodNotFound, `Method not found: ${req.method}`)
            return
        }

        try {
            const result = await handler(req.params)
            this.respondOk(req.id, result ?? null)
        } catch (e: any) {
            this.respondError(req.id, ErrorCode.InternalError, e?.message || "Internal error", e?.stack)
        }
    }

    // 等待所有未完成的 handle 完成（用于 stdin 关闭时排空）
    async drain(): Promise<void> {
        while (this.pending.size > 0) {
            await Promise.all(this.pending)
        }
    }

    // 主动推送通知（JSON-RPC 通知，无 id）
    notify(method: string, params?: any): void {
        const msg: JsonRpcNotification = { jsonrpc: "2.0", method, params }
        this.writer(msg)
    }

    private respondOk(id: string | number, result: any): void {
        const msg: JsonRpcSuccess = { jsonrpc: "2.0", id, result }
        this.writer(msg)
    }

    private respondError(id: string | number | null, code: number, message: string, data?: any): void {
        const msg: JsonRpcError = {
            jsonrpc: "2.0",
            id,
            error: { code, message, data }
        }
        this.writer(msg)
    }
}