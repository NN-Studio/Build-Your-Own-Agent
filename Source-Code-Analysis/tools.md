# 本地工具集（tools）的设计与实现

> 代码主要位于 [../packages/tools/src/](../packages/tools/src/)，入口在 [../packages/tools/src/index.ts](../packages/tools/src/index.ts)

`@build-your-own-agent/tools` 是直接喂给 `Agent({ tools, systemPrompt })` 的本地工具集合。它把"读文件、写文件、搜代码、执行命令"等日常开发动作抽象成一组 OpenAI function calling 风格的工具，再附带一段系统提示，模型据此可以独立完成仓库内的检索与修改。

## 目录结构

```
packages/tools/src/
├── workdir.ts            # 解析仓库根路径
├── list_dir.ts
├── read_file.ts
├── write_file.ts
├── edit_file.ts
├── search_code.ts       # 按文件名正则搜索
├── search_text.ts       # 按文件内容正则搜索
├── run_command.ts       # 受限的 execFile
└── index.ts             # 汇总 + 默认 systemPrompt
```

每个工具文件都遵循同一形态：导出一个 `ToolDefinition`（含 `name` / `description` / `parameters`，schema 风格）+ 一个 `handler(args)` 实现。这与 `agent.callFunk.ts` 中"用 name 匹配 + JSON.parse(args)"的协议完全契合，参见 [agent.md](./agent.md)。

## 工具清单

[index.ts](../packages/tools/src/index.ts) 中的 `tools` 数组按"信息获取 → 修改 → 执行"的顺序排列：

| 工具 | 用途 | 关键参数 |
| --- | --- | --- |
| `list_dir` | 列目录（不递归） | `path` |
| `read_file` | 读文件 | `path`, `maxBytes?`（默认 1MB） |
| `search_code` | 按文件名正则递归搜索 | `pattern`, `path?` |
| `search_text` | 按内容正则搜索行级匹配 | `pattern`, `path?`, `include?` |
| `write_file` | 创建/覆盖文件（建父目录） | `path`, `content` |
| `edit_file` | 精确替换文件片段 | `path`, `oldString`, `newString`, `replaceAll?` |
| `run_command` | 受限执行命令 | `command`, `args[]`, `cwd?` |

> `search_code` 与 `search_text` 都跳过 `node_modules`、`.git`、`dist`、`build`、`.cache` 与隐藏目录。

## 安全策略

所有工具共享几个核心安全约定：

1. **仓库根白名单**：`workdir.ts` 解析出仓库根绝对路径，所有 path/cwd 都要么相对仓库根、要么是仓库内的绝对路径；越界直接报错。
2. **run_command 拒绝危险模式**：与 [mcp.md](./mcp.md) 中 MCP 端的 `run_command` 类似，正则拦截 `rm -rf /`、`sudo`、`mkfs`、`dd if=`、fork bomb、`curl|sh`、`wget|sh` 等。
3. **`execFile` + `shell: false`**：`run_command` 强制走 `execFile(command, args, { shell: false })`，杜绝 shell 注入。
4. **超时与输出上限**：超时 30s、输出上限 256KB，超出截断并附标记。

这套策略与 MCP server 中的 `run_command` 几乎完全一致——同一份思路在两套包（本地 and 协议）里各自落地。

## 默认 systemPrompt

[index.ts](../packages/tools/src/index.ts) 还导出了一个 `systemPrompt` 常量。它包含：

- **可用工具** 一节：逐个说明每个工具的语义、参数与边界（不展开 JSON schema，避免占过多上下文）。
- **工作目录与安全** 一节：强调 path 相对仓库根、拒绝越界、`run_command` 危险命令清单、搜索忽略目录。
- **工作建议** 一节：先 `list_dir` → `read_file` → `edit_file` 的工作流；编辑优先 `edit_file`、新增用 `write_file`。
- **输出风格** 一节：要求简洁直接、引用相对路径、工具失败时阅读错误信息重试。

它会被 [src/index.ts](../src/index.ts) 用 `buildSystemPrompt(toolsPrompt, REPO_ROOT)` 拼上 Skills 段后整体作为 systemPrompt。

## 与 Agent 的协作

- Agent 不需要知道这些工具的存在：它只接受一组 `{ description, valueOf }`，由 `callFuns` 按 tool_call.name 调用对应工具的 `valueOf`（参见 [agent.md](./agent.md)）。
- 工具返回值是**字符串**（读文件的内容、搜索结果列表、命令输出等），由 Agent 再以 `tool` 角色塞回 context。
- 工具失败时，工具内部选择抛出或返回错误字符串，由 Agent 一并写入 context，不会让上下文格式错位。

## 与 MCP 的关系

`tools` 包与 `mcp-server` 暴露的工具几乎一一对应（`read_file` / `list_dir` / `search_code` / `run_command`），但二者是**两套独立实现**：

- `tools` 直接挂到 `Agent.tools`，无需协议开销，速度快；
- `mcp-server` 暴露成协议，可被任意 MCP 客户端调用；
- 二者共享同一份安全思想（仓库根白名单、危险命令正则、`shell: false`），但代码是独立的，未来可以考虑把核心工具逻辑抽出共用一份实现。