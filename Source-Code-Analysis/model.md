# 如何和模型LLM交互?

> 代码主要位于 [./packages/model/src/index.ts](../packages/model/src/index.ts)，配套文件 [parseString.ts](../packages/model/src/parseString.ts)

和大模型 LLM 的交互，对外暴露的是一个 `Model` 类，其核心方法是 `completions(params, logback, thinkback)`：对于调用方（也就是 [agent.md](./agent.md) 中描述的 `Agent`）而言，本质上就是一次 **POST 请求**——把 `messages`、`tools`、`stream` 等参数发出去，再以统一的形式拿到 `{ content, tool_calls }`。

用户的可配置参数主要落在 [../../config.ts](../../config.ts) 里，目前内置了三种 OpenAI 兼容的本地推理环境：`ollama`、`llama.cpp`、`py3model`，最后由数组 `["py3model"]` 等选中当前要使用的环境。`Model` 会从 `config` 解析出 `request`（`http` 或 `https`）、`hostname`、`port`、`path`、`apiKey`、`model`，因此替换推理后端不需要改 `Model` 内部代码。

## Method 签名

```typescript
completions(
    params: {
        messages: Array<any>,
        stream: boolean,
        tools: Array<any>
    },
    logback:   (text: string) => void = () => {},
    thinkback: (text: string) => void = () => {}
): Promise<{ content: string, tool_calls: Array<any> }>
```

- `params.stream`：是否走流式（SSE）。`Agent.invoke` 在内部固定传 `true`，但内部代码同时支持非流式（把所有 chunk 累积起来一次性走 `choices_handler`）。
- `logback`：收到正式回答内容的回调（终端里表现为逐字打印）。
- `thinkback`：收到"思考过程"内容的回调（终端里以蓝色 ANSI 着色输出，参见 `Agent.invoke`）。

返回值是 `{ content, tool_calls }`：把模型这一轮完整可用的"正文"和"工具调用"分别收拢，方便上层 `Agent` 选择是继续工具循环还是直接 `resolve` 给用户。

## 三块细节

### 1. SSE 字符串解析：parseString

[parseString.ts](../packages/model/src/parseString.ts) 是一个非常紧凑的适配层：把 OpenAI 兼容服务的 SSE（`data: {...}\n\n`）格式数据切成可被 `JSON.parse` 处理的字符串。

- 先 `value.trim()`，去掉前缀 `data: `、去掉结尾的 `data: [DONE]` 标记。
- 如果出现多次 `\n\ndata: `（即多行 SSE），就用它们 `split` 后再用逗号 `join`，外面套一层 `[ ... ]` 后 `JSON.parse` 一次性解析。
- 纯 `[DONE]` 行直接返回空数组。
- 任何 `JSON.parse` 失败会抛出 `"[转json失败]<原文>"`，方便把脏数据带回到错误信息里。

### 2. 流式 → 增量合并：choices_handler

`completions` 的核心循环是 `choices_handler(choices)`。它在一个流式会话里被反复调用，参数是已经按 SSE 切片得到的增量 `choices`。整段逻辑可以拆成下面三个独立的部分。

#### 2.1 reasoning / 思考内容

```typescript
let reasoning = choices[i].delta.reasoning || choices[i].delta.reasoning_content
```

- 当上游返回 `reasoning` 或 `reasoning_content` 字段时（Qwen 等"会思考"的模型常见），这一段内容被整体丢给 `thinkback`。这是"思考日志"显示的主要来源。

#### 2.2 文本正文 + 剥离 think 块

模型有时会把 `<think>...</think>` 嵌入到 `delta.content` 内部。本项目针对这种混合流做了"以 think 块为边界拆分"的处理：

- 进入 think 之前（`in_think === false`）：在 `deltaContent` 中循环找 `<think>`；找到后把"前面这一段"作为正式正文落进 `content` 并通过 `logback` 输出，然后把 `<think>` 之后到 `</think>` 之间的部分丢给 `thinkback`、丢弃。若本段没有出现闭合，则进入"跨 chunk 的 think"分支 `in_think = true`。
- 处于 think 中（`in_think === true`）：所有到达的 `deltaContent` 都被原样喂给 `thinkback`，直到遇到一个 `</think>`；遇到之后截掉 `</think>` 及其之前的内容、回到正常正文模式。
- 收尾时把 `deltaContent` 剩余部分累计进 `content` 并 `logback`。

> 综上：带有显式 `reasoning` 字段的流会被分流到 `thinkback`；正文里若混有 `<think>...</think>` 也同样会被剥离到 `thinkback`，且不会被保存到最终 `content` 里——这保证返回给上层 Agent 的 `content` 是"思考之外"的真实回复。

#### 2.3 工具调用：增量 id + 参数拼字符串

```typescript
if (choices[i].delta.tool_calls) {
    for (let tool_call of choices[i].delta.tool_calls) {
        if (tool_call.id) {
            tool_calls.push(tool_call);
        } else {
            tool_calls[tool_calls.length - 1].function.arguments += tool_call.function.arguments;
        }
    }
}
```

- OpenAI 兼容服务在 SSE 里通常只在第一个增量 `chunk` 给出 `tool_call.id` 和 `function.name`，之后每个 `chunk` 只补一段 `function.arguments` 的字符串片段。
- 这里用"是否存在 `id`"作为"是不是同一个工具调用"的标志：遇到新 `id` 就 `push` 一条；否则就把它当作上一次调用的参数续片，用 `+=` 拼到末尾（典型的字符串增量合并）。
- 上层 `Agent` 拿到最终的 `tool_calls`，传入 [`callFuns`](../packages/agent/src/callFuns.ts) 时会用 `JSON.parse` 解析整段 `arguments` 字符串。

### 3. 非流式：聚合成 delta

当 `params.stream === false` 时，源码将 `res.on('data')` 收集到的所有 chunk 累加成字符串，在 `res.on('end')` 中用 `parseString` 解析后构造成 `[{ delta: message }]` 再交给 `choices_handler` 处理。这样复用同一套 thinking / content / tool_calls 合并逻辑，避免在两套分支里维护同样复杂的拼接规则。

## 一次完整请求的时序

总结下来，一次 `completions` 调用大致是按下面的步骤执行的：

1. 构造 HTTP body：`{ model, messages, tools, stream }`。`tools` 在这里只携带 `tool.description`（即 OpenAI tool schema），不带具体的 `valueOf` 可执行体——可执行体是 Agent 上层才需要的，模型只需要看 schema。

2. 通过 `http`(或 `https`) 模块发起 `POST {config.path}/chat/completions`，带上 `Authorization: Bearer <apiKey>`。

3. 流式分支：用 `parseString` 把每个 SSE 分片解析成对象，再交给 `choices_handler`：
   - `thinkback` → `think` 块被实时打印到终端；
   - `logback` → 正文字符被实时打印到终端；
   - `tool_calls` → 按 id 增量合并出完整调用。

4. 非流式分支：先把整段响应缓存成字符串，在 `end` 时按流式分支同样的方式走一遍 `choices_handler`。

5. 最终 `resolve({ content, tool_calls })`：把这一轮模型认为"该给上层看的"正文和工具调用一起交给 `Agent` 决定下一步走向。

## 与 Agent 的协作边界

- `Model` 只负责"一次模型调用"，它对 ReAct/工具循环、上下文拼接、是否结束都没有概念。`{ content, tool_calls }` 就是它对上层表达的全部信息。
- `thinkback` 是 `Agent.invoke` 在调用处传入的（固定以蓝色 ANSI 着色打到 `process.stdout`）。所以"边思考边打印"的体验完全由上层传入的回调决定，并不是 `Model` 自行输出。
- `parseString` 之所以单独拆出来，是因为非流式和流式结束时的"补救路径"都需要它来反序列化，并且它对异常情况（`[DONE]`、多行 SSE、解析失败）都给出了兜底。

> 顺带一提：仓库里已经预留了 `tool_name` 字段（见 [agent.md](./agent.md) 中关于 `tool` 消息的说明），表明这套交互是为多种 OpenAI 兼容协议做适配的——`Model` 层只关心 OpenAI 风格 SSE，差异主要来自不同本地推理服务本身的输出字段差异。
