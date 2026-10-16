# 如何让模型使用 Skills（systemPrompt 注入）

> 代码主要位于 [../packages/use-skills/src/skills.ts](../packages/use-skills/src/skills.ts)、[../packages/use-skills/src/index.ts](../packages/use-skills/src/index.ts)
>
> Skill 包位于 [../src/skills/](../src/skills/)，每个 Skill 由 `SKILL.md` 与一组 `.py` 脚本组成（docx / pdf / pptx 等）。

## 什么是 Skill

本项目中的 Skill 不是函数调用（Function Calling）级别的小工具，而是一种**任务级的能力包**：每个 Skill 目录下放置一份 `SKILL.md`（顶部 frontmatter 的 `description` 说明"何时调用"，正文说明 Skill 是什么、如何调用），并配上一组 Python 脚本作为真正的"执行体"。模型通过读取 `SKILL.md` 知道自己能做什么、需要调哪个 python 脚本、传什么参数。

这种形态参考了 Anthropic Skills 的设计：模型在 `systemPrompt` 里看到一份"可用 Skill 清单"，需要完成某类任务时主动翻看对应 SKILL.md，再通过 `run_command` 跑相关脚本。

## 包结构

```
src/skills/
├── docx/
│   ├── SKILL.md            # 任务说明（包含 YAML frontmatter）
│   └── scripts/            # 若干 .py 脚本（docx-js、pandoc、merge_runs 等）
├── pdf/
│   ├── SKILL.md
│   ├── forms.md / reference.md   # 嵌套文档（仅 SKILL.md 被加载）
│   └── scripts/
└── pptx/
    ├── SKILL.md
    └── scripts/
```

`use-skills` 包只把 `src/skills/<name>/SKILL.md` 这一层（一级目录）作为 Skill 入口；二级文档（`pdf/forms.md`、`pdf/reference.md`）不参与加载，避免把大段参考资料误注入到 prompt。

## 入口：三个导出

[packages/use-skills/src/index.ts](../packages/use-skills/src/index.ts) 非常薄：

```typescript
export { loadSkills, formatSkillsSection, buildSystemPrompt } from "./skills"
export type { SkillMeta } from "./skills"
```

- `loadSkills(rootDir)`：扫描 `rootDir/src/skills/*/SKILL.md`，返回 `SkillMeta[]`。
- `formatSkillsSection(skills)`：把 `SkillMeta[]` 渲染成可读 prompt 片段。
- `buildSystemPrompt(base, rootDir)`：便捷函数，把 base prompt 和 skills 拼成完整 systemPrompt。

### SkillMeta

```typescript
interface SkillMeta {
    name: string        // SKILL.md frontmatter 的 name（缺省时回退到目录名），如 docx
    description: string // SKILL.md frontmatter 的 description，用来说明"何时该用该 skill"
    dir: string         // 绝对路径
    skillPath: string   // 相对 rootDir 的路径，如 "src/skills/docx"，也是调用时的 cwd
    scripts: string[]   // 相对 skill 目录的脚本路径列表（递归收集 .py）
    content: string     // SKILL.md 正文（已剥离 YAML frontmatter）
}
```

## loadSkills：扫描规则

[loadSkills](../packages/use-skills/src/skills.ts#L75-L124) 行为：

1. 定位 `<rootDir>/src/skills`。目录不存在就直接返回 `[]`。
2. 一级列举目录项，跳过 `node_modules`、`.git`、`dist`、`build`、`.cache` 等 `SKIP_DIRS`，以及以 `.` 开头的隐藏项。
3. 对每个子目录，校验必须包含 `SKILL.md`，没有就跳过。
4. 用 `parseFrontmatter` 解析 SKILL.md 顶部的 YAML frontmatter，取出 `name` 与 `description`（`name` 缺省时才回退到目录名）；正文剥离 frontmatter 后作为 `content`。
5. 递归扫描该 Skill 目录，把所有 `.py` 文件收集进 `scripts`（相对 skill 目录），供模型以该 Skill 目录为 cwd 调用。
6. 最终构造 `SkillMeta`。

注意 `listScripts` 除了跳过 `SKIP_DIRS` 与隐藏项，还会跳过 `validators/`、`helpers/` 这类内部库目录（`SKIP_LIB_DIRS`）和 `__init__.py`（`SKIP_FILES`）——它们只被入口脚本 import，不作为可执行脚本暴露给模型。因此 `node_modules`、内部库里的 python 脚本都不会进入 `scripts`。

## formatSkillsSection：prompt 拼接

[formatSkillsSection](../packages/use-skills/src/skills.ts#L127-L168) 把所有 Skill 渲染成这样的结构（简化）：

```
## 可用 Skills

每个 Skill 的 SKILL.md 与脚本路径都相对该 Skill 目录。调用脚本时用 run_command，并把 cwd 设为该 Skill 目录（下方逐个标注）。

### Skill: docx

- 目录（调用脚本时作为 run_command 的 cwd）：src/skills/docx
- 脚本（相对该目录，用 run_command + args 数组调用）：
  - `python3 scripts/merge_runs.py <args>`
  - ...
--- SKILL.md ---

[SKILL.md 正文（已剥离 frontmatter）]

--- /SKILL.md ---

### Skill: pptx
...

## 何时调用 Skill

- **docx**：Use this skill whenever the user wants to create ...
- **pdf**：Use this skill whenever the user wants to do ...
- **pptx**：Use this skill any time a .pptx or .potx ...
- 调用方式：`run_command(command='python3', args=['scripts/merge_runs.py', '<arg>'], cwd='src/skills/docx')`
- run_command 的 cwd 默认为仓库根；执行 Skill 脚本务必显式传 cwd（即上面的 Skill 目录），否则 SKILL.md 里的 `scripts/...` 相对路径会找不到。
- 如果脚本依赖未安装（如 lxml），run_command 会失败 → 改用 pip 安装或换其他工具完成任务。
```

最终会被 `buildSystemPrompt` 用 `\n\n` 拼到 `base` prompt 的后面。

## 在 Agent 中使用

[../src/index.ts](../src/index.ts) 中的关键几行：

```typescript
import { tools, systemPrompt as toolsPrompt } from "@build-your-own-agent/tools"
import { buildSystemPrompt } from "@build-your-own-agent/use-skills"

const REPO_ROOT = path.resolve(__dirname, "..")

const agent = new Agent({
    model: new Model(),
    tools,
    systemPrompt: buildSystemPrompt(toolsPrompt, REPO_ROOT),
})
```

也就是说：**tools（[tools.md](./tools.md)）负责给模型"能调的工具函数"，use-skills 负责给模型"任务的说明书"**——两者协同：模型在 systemPrompt 里读到"什么时候用 Skill、怎么拼命令"，然后用 tools 里的 `run_command` 把脚本真正跑起来。

## 设计要点

- **不增加新接口**：Skill 不暴露成 OpenAI function calling 的 schema，而是把 `SKILL.md` 正文塞进 systemPrompt。优点是零新增协议、模型可读上下文更丰富；缺点是 SKILL.md 过长会占上下文。
- **路径基准统一为 Skill 目录**：SKILL.md 正文里的脚本路径（`scripts/...`）本就相对 skill 目录，因此注入时也以该目录作为 `run_command` 的 `cwd`，避免"正文说相对 skill 目录、外壳却让 cwd 落在仓库根"的冲突。
- **解析 frontmatter**：`loadSkills` 只取 `name` / `description` 两个字段——`description` 决定"何时调用"段落，正文剥离 frontmatter 后注入，避免把 `license` 之类的 YAML 噪声带进 prompt；`listScripts` 只保留入口脚本，过滤 `__init__.py` 与 `validators/`、`helpers/` 内部库，减少 prompt 噪音。
- **职责单一**：`use-skills` 只负责扫描 + 拼文本，工具执行仍交给 `tools.run_command`，两者解耦。
- **沙箱边界**：`run_command` 的 `cwd` 必须落在仓库内（见 [tools.md](./tools.md) / [mcp.md](./mcp.md)），而 Skill 的脚本又恰好全在仓库的 `src/skills/<name>/scripts/` 下，刚好满足白名单，因此 Skill 调用与沙箱策略天然契合。