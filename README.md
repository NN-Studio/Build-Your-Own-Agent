# [Build Your Own Agent](https://github.com/NN-Studio/Build-Your-Own-Agent)
借鉴 Harness Engineering 等架构设计思想开发智能体，基于TypeScript原生开发

<p>
    <a href="https://github.com/NN-Studio/Build-Your-Own-Agent" target='_blank'>
        <img alt="GitHub repo stars" src="https://img.shields.io/github/stars/NN-Studio/Build-Your-Own-Agent">
    </a>
    <a href="https://github.com/NN-Studio/Build-Your-Own-Agent">
        <img src="https://img.shields.io/github/forks/NN-Studio/Build-Your-Own-Agent" alt="forks">
    </a>
    <a href="https://github.com/NN-Studio/Build-Your-Own-Agent/issues">
        <img src="https://img.shields.io/github/issues/NN-Studio/Build-Your-Own-Agent" alt="issue">
    </a>
    <a href="https://gitee.com/NN-Studio/Build-Your-Own-Agent" target='_blank'>
        <img alt="Gitee repo stars" src="https://gitee.com/NN-Studio/Build-Your-Own-Agent/badge/star.svg">
    </a>
    <a href="https://gitee.com/NN-Studio/Build-Your-Own-Agent">
        <img src="https://gitee.com/NN-Studio/Build-Your-Own-Agent/badge/fork.svg" alt="forks">
    </a>
</p>

> 本项目的目的是完成智能体开发相关思想落地，所以不会基于开源智能体框架而是尽力纯原生实现，以学习而非产品为目的。

## 写在前面

我们将基于现实情况，慢慢完善项目功能，以循序渐进的方式逐步增加或改造：

在设计模式上按照ReAct模式、Plan-And-Execute模式、Harness模式等思想渐渐加强的方式一步步完善设计。

在功能上根据实际情况逐步实现Tools、Skills、MCP、Memory Store、Virtual filesystem等。

所有功能或设计都会根据实际情况新增、删除或修改等。有任何希望我们支持的功能或讨论的，都可以通过 [Issue](https://github.com/NN-Studio/Build-Your-Own-Agent/issues) 给我们留言～

## 如何使用？

首先，你需要根据你的情况修改必要的配置[./config.ts](./config.ts)，主要是大模型LLM相关。

配置修改好以后，在项目根目录，完成依赖安装：

```
pnpm i
```

然后运行即可：

```
pnpm start
```

## 目录结构
下面是主要文件说明：

```
- pageages/ # 依赖
    - model/ # 和LLM模型交互的API
    - agent/ # 单一智能体（ReAct模式）
- src/ # 源码
- test/ # 测试
- config.js # 配置
```

## 源码解析

这里我们将逐步说明这个智能体的相关知识和实现细节：

- [如何和模型LLM交互?](./Source-Code-Analysis/model.md)
- [遵循ReAct模式开发的基础智能体对象](./Source-Code-Analysis/agent.md)

## 版权

MIT License

Copyright (c) [zxl20070701](https://zxl20070701.github.io/notebook/home.html) 走一步，再走一步