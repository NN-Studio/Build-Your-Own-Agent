# 如何和模型LLM交互?

> 代码主要位于 [./packages/model/src/index.ts](../packages/model/src/index.ts)

也就是和大模型LLM的交互，对于用户而言，本质上来说就是一次POST请求。

用户可以传递工具、提示词等获取大模型的一次回答。