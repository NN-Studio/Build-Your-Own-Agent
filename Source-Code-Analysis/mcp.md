# MCP 服务端与示例（stdio JSON-RPC）

> 代码主要位于 [../packages/mcp-server/src/](../packages/mcp-server/src/)，客户端示例 [../src/mcp.example.ts](../src/mcp.example.ts)
>
> MCP（Model Context Protocol）官方规范：<https://modelcontextprotocol.io/specification/2024-11-05>

MCP 解决的是"工具如何被任何遵循协议的客户端调用"。本项目把"读文件、搜索、执行命令"打包成了一个**独立的 MCP Server**，通过 stdio + JSON-RPC 2.0 与外部通信；Agent（或任何客户端）只需按协议握手、列工具、调用工具，无需内嵌工具实现。

## 目录结构

```
packages/mcp-server/
├── bin/
│   └── run                # 启动脚本（注册 ts-node 后 require src/index.ts）
└── src/
    ├── index.ts           # CLI 入口：注册方法 + 启动传输
    ├── server.ts          # 方法注册表 + JSON-RPC 分发
    ├── transport.ts       # stdio 传输（按行解析 stdin，向 stdout 写响应）
    ├── sandbox.ts         # 路径白名单（read_file / run_command 共用）
    ├── types.ts           # JSON-RPC 与 MCP 类型定义
    ├── tools/
    │   ├── index.ts       # 工具注册表（4 个工具）
    │   ├── read_file.ts
    │   ├── list_dir.ts
    │   ├── search_code.ts
    │   └── run_command.ts
    └── methods/
        ├── initialize.ts       # 握手
        ├── tools.list.ts       # 列工具
        ├── tools.call.ts       # 调工具
        ├── resources.list.ts   # 列出仓库关键文件为 MCP resources
        └── resources.read.ts    # 读取某个 resource
```

## 协议基础：JSON-RPC 2.0

[types.ts](../packages/mcp-server/src/types.ts) 给出了 JSON-RPC 2.0 + MCP 协议的类型：

- `JsonRpcRequest` / `JsonRpcNotification` / `JsonRpcSuccess` / `JsonRpcError`：标准四类帧。
- `ErrorCode`：常量集合（`-32700 ParseError` 等）。
- `ToolDefinition`：MCP 中描述工具的标准结构（`name` + `description` + `inputSchema`）。
- `ToolCallResult`：执行工具后的返回（`content: [{ type: "text", text }]` + `isError`）。
- `ResourceDefinition` / `ReadResourceResult`：MCP resources 的描述与读取结果。

> `_request && _notification` 是输入帧；Server 只往外输出 success / error；自身也能用 `notify()` 主动发起 JSON-RPC 通知（无 `id`）。

## 启动流程：transport ↔ server

[index.ts](../packages/mcp-server/src/index.ts) 中构造顺序很关键：

```typescript
const transport = new StdioTransport((frame) => {
    server.handle(frame).catch(...)
})

server = new Server(transport.write.bind(transport))
transport.onClose(() => server.drain())

server.register("initialize", handleInitialize)
server.register("ping", () => ({}))
server.register("tools/list", handleToolsList)
server.register("tools/call", handleToolsCall)
server.register("resources/list", handleResourcesList)
server.register("resources/read", handleResourcesRead)
```

1. 先建 transport：它立刻开始监听 stdin，但**先不开 server**。
2. 再建 server：拿到 transport.write 作为"输出函数"。
3. transport 收到每一行 JSON 帧 → 回调 `server.handle(frame)`，并发的请求各自有 pending Promise。
4. stdin 关闭时，transport 先调用 `server.drain()` 排空所有 in-flight 请求，再 `process.exit(0)`。

> 注意：输出走的是 `process.stdout.write(JSON.stringify(...) + "\n")`，**绝不能用 `console.log`**——后者会在某些 Node 版本里被自动加颜色或额外换行，破坏协议流。

## Server：方法注册 + 分发

[server.ts](../packages/mcp-server/src/server.ts) 实现：

- `methods: Map<string, MethodHandler>`：方法名 → handler。
- `handle(frame)`：每帧进来都创建一个 Promise 并放进 `pending`，最后 `.finally` 移除——这就是 `drain()` 能"等所有请求结束"的基础。
- `_handle(frame)`：
  - 没有 `id` 字段 → 通知路径，错误只记日志，不返回（JSON-RPC 规定通知不需要响应）。
  - 有 `id` → request 路径：查表找 handler；找不到就回 `-32601 MethodNotFound`；handler 抛错则回 `-32603 InternalError`。
- `drain()`：循环 `Promise.all(this.pending)`，直到 `pending` 为空，用于 stdio 关闭时优雅退出。
- `notify(method, params)`：Server 主动推送通知（无 `id`）。

## Transport：按行切 JSON 帧

[transport.ts](../packages/mcp-server/src/transport.ts) 用 `readline` 按行解析：

- `crlfDelay: Infinity`：让 readline 正确处理 `\r\n`。
- 解析失败时直接回复 `-32700 ParseError`，`id` 为 `null`（因为无法从坏行里拿到 id）。
- `onClose(fn)` 提供一个钩子，在 stdin 关闭时先做"排空"再退出。

## 沙箱：路径白名单

[sandbox.ts](../packages/mcp-server/src/sandbox.ts)：

- `REPO_ROOT = path.resolve(__dirname, "../../../")`：从 `packages/mcp-server/src/sandbox.ts` 向上三级到仓库根。
- `isPathAllowed(p)`：解析为绝对路径，再用 `path.relative(REPO_ROOT, abs)` 判断是否逃逸到仓库外。任何 `rel.startsWith("..")` 或 `path.isAbsolute(rel)` 的路径都拒绝。
- `isInPackagesSrc(p)`：额外限制某些工具只能动 `packages/*/src`（当前未在 tools 里启用，但保留了接口）。
- `repoRoot()`：把仓库根绝对路径暴露给工具实现。

这套沙箱是 read_file / list_dir / run_command 共用的安全网，核心思路是"以仓库根为唯一可寻址空间"。

## 工具集：4 个

[tools/index.ts](../packages/mcp-server/src/tools/index.ts) 注册：

| 工具 | 关键参数 | 安全约束 |
| --- | --- | --- |
| `read_file` | `path`, `maxBytes?` | 路径必须在仓库内 |
| `list_dir` | `path?` | 路径必须在仓库内 |
| `search_code` | `pattern`, `path?` | 跳过 `node_modules`、`.git` 等 |
| `run_command` | `command`, `args[]`, `cwd?` | cwd 仓库内；拒绝危险正则；`shell: false` |

### run_command 的细节

[run_command.ts](../packages/mcp-server/src/tools/run_command.ts) 关键点：

- 参数是数组形式（`{ command, args: [...], cwd? }`），**强制走 `execFile`，`shell: false`**——这是抵御命令注入的关键（与 [tools.md](./tools.md) 中本地 tools 的策略一致）。
- `DANGEROUS` 正则列表拦截 `rm -rf /`、`sudo`、`mkfs`、`dd if=`、`:(){:|:&};:`、`curl|sh`、`wget|sh` 等。
- `cwd` 通过 `isPathAllowed` 校验，超出仓库根直接拒绝。
- 超时 30s、输出上限 256KB，超出则截断并附 `[截断：超过 ... 字节]` 标记。
- 错误时返回 `isError: true`，把 exit code 拼到结果末尾。

## MCP 方法：握手 + 列/调用

### `initialize`

[methods/initialize.ts](../packages/mcp-server/src/methods/initialize.ts) 返回固定握手信息：

```typescript
{
    protocolVersion: "2024-11-05",
    capabilities: { tools: {}, resources: {} },
    serverInfo: { name: "@build-your-own-agent/mcp-server", version: "0.1.0" }
}
```

客户端接着必须发 `notifications/initialized`（无 id）表示握手完成；服务端把这条通知登记为静默处理，只写一行 stderr 日志。

### `tools/list`

[tools.list.ts](../packages/mcp-server/src/methods/tools.list.ts) 直接返回 `tools/index.ts` 中定义的工具数组（含 `name` / `description` / `inputSchema`）。

### `tools/call`

[tools.call.ts](../packages/mcp-server/src/methods/tools.call.ts)：

1. 校验 `name` 必填。
2. 在 `toolHandlers` 字典里查 handler；找不到返回 `isError: true`。
3. handler 抛错被捕获，返回 `isError: true` + 错误消息（避免异常透传到协议层）。

### `resources/list`

[resources.list.ts](../packages/mcp-server/src/methods/resources.list.ts) 把仓库里的若干关键文件（README.md、config.ts、package.json、tsconfig.json 等）以及 `skills`、`packages/*/src` 下的若干 ts/md/json 暴露为 MCP resources，URI 形如 `file://<绝对路径>`。

### `resources/read`

[resources.read.ts](../packages/mcp-server/src/methods/resources.read.ts)：

- URI 必须以 `file://` 开头，否则拒。
- 截取 `file://` 之后的路径（`decodeURIComponent` 兜底），用 `isPathAllowed` 校验白名单。
- 不在白名单返回 `路径越界`；不存在返回 `文件不存在`；通过就 `fs.readFileSync` 返回全文。

## 客户端示例：src/mcp.example.ts

[../src/mcp.example.ts](../src/mcp.example.ts) 提供三个端到端的示例，演示 `McpClient` 类（一个最小 stdio JSON-RPC 客户端）如何与本包 MCP server 对接：

### 示例 A：握手 + 调 read_file

1. `spawn` 一个 `npx ts-node ./packages/mcp-server/src/index.ts` 子进程。
2. 发送 `initialize` 请求，拿到 `serverInfo`，再 `notify("notifications/initialized")`。
3. 发 `tools/list` 看可用工具。
4. 发 `tools/call { name: "read_file", arguments: { ... } }` 读 `package.json`。

### 示例 B：MCP tools → OpenAI tools

MCP 的 `tools/list` 返回的 `inputSchema` 本质就是 OpenAI 的 `parameters`。示例 B 演示如何**不需要写任何映射**直接喂给 OpenAI 客户端：

```typescript
const openaiTools = tools.map(t => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema }
}))
```

再假设模型返回了 `tool_call`，调用 `tools/call` 把 args 转发出去。

### 示例 C：MCP Client → Agent tool

最贴合项目主线的一例：

1. 客户端连上 MCP server，拉取 `tools/list`。
2. 把每个 MCP 工具包成 Agent 期望的 `{ description, valueOf }` 形态，其中 `valueOf(args)` 内部调 `mcp.request("tools/call", { name, arguments: args })`，再把 `content[].text` 拼回字符串。
3. `new Agent({ model: new Model(), tools: agentTools, systemPrompt: ... })`，`invoke({ messages })` 即可。

这一步让 Agent **无需修改** `agent` 包本身，就把外部 MCP server 的工具无缝纳入 ReAct 循环，体现了 MCP "工具即协议" 的好处。

## 启动方式

`package.json` 的 `bin`：

```json
"bin": { "mcp-server": "bin/run" }
```

`bin/run` 用 `ts-node` 即时编译 `src/index.ts`，无需维护 dist。常用命令：
```bash
pnpm mcp          # 启动 MCP server（通过 bin/run）
pnpm dev          # 启动 Agent 主程序
pnpm start        # oipage-cli 同时跑 mcp + dev（并行启动）
```

## 设计要点

- **协议独立于 Agent**：MCP server 不依赖 `@build-your-own-agent/agent`、不依赖 `Model`，可以单独拉起作为子进程，也可以被任何符合 MCP 规范的客户端使用。
- **安全兜底在工具层**：所有路径/命令安全都在 `sandbox.ts` 和 `run_command.ts` 中处理，协议层不背锅。
- **stdio JSON-RPC 是 MCP 的"标准传输"之一**：项目里没有实现 SSE / HTTP 传输，保持最小依赖。bin/run 用 `shell: false` 启动 `execFile`、用 `process.stdout.write` 输出帧，杜绝任何 shell 注入与协议污染。
- **resources 与 tools 并存**：MCP 协议下"工具"和"资源"是两类独立能力——本项目把读文件当作"工具"（`read_file`），把"暴露仓库关键文件供客户端列举"当作"资源"，两种抽象都按规范实现了一份。