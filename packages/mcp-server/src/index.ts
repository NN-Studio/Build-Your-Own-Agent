// CLI 入口：注册方法 → 启动 stdio 传输 → 把每帧交给 Server

import { StdioTransport } from "./transport"
import { Server } from "./server"
import { handleInitialize, SERVER_INFO } from "./methods/initialize"
import { handleToolsList } from "./methods/tools.list"
import { handleToolsCall } from "./methods/tools.call"
import { handleResourcesList } from "./methods/resources.list"
import { handleResourcesRead } from "./methods/resources.read"

process.title = SERVER_INFO.name

// Server 接受一个 writer 函数；用 transport.write 当 writer。
// 顺序：先建 transport（它需要 server.handle 作回调）→ 再建 server → 注册方法。
let server: Server

const transport = new StdioTransport((frame) => {
    server.handle(frame).catch((e) => {
        process.stderr.write(`[mcp-server] handle error: ${e}\n`)
    })
})

server = new Server(transport.write.bind(transport))

// stdin 关闭时，让 transport 等 server 排空所有 in-flight 请求
transport.onClose(() => server.drain())

// 注册所有标准 MCP 方法
server.register("initialize", handleInitialize)
server.register("ping", () => ({}))
server.register("tools/list", handleToolsList)
server.register("tools/call", handleToolsCall)
server.register("resources/list", handleResourcesList)
server.register("resources/read", handleResourcesRead)

// 静默通知：客户端握手完成
server.register("notifications/initialized", () => {
    process.stderr.write("[mcp-server] client initialized\n")
})