// skills：把 src/skills/<name>/SKILL.md 加载成 systemPrompt 片段
// 模型通过 run_command 调用对应脚本；调用 Skill 脚本时以该 skill 目录作为 cwd，
// 与 SKILL.md 正文里"脚本路径相对 skill 目录"的说法保持一致

import * as fs from "fs"
import * as path from "path"

export interface SkillMeta {
    name: string
    description: string // 来自 SKILL.md frontmatter，用来说明"何时该用该 skill"
    dir: string
    skillPath: string // 相对 rootDir 的路径，如 "src/skills/docx"，也是调用时的 cwd
    scripts: string[] // 相对 skill 目录的脚本路径列表，如 "scripts/merge_runs.py"
    content: string // SKILL.md 正文（已剥离 YAML frontmatter）
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".cache"])
// 内部库目录：只被入口脚本 import，不作为可执行脚本暴露给模型
const SKIP_LIB_DIRS = new Set(["validators", "helpers"])
// 包初始化文件不是入口脚本
const SKIP_FILES = new Set(["__init__.py"])

// 递归列脚本（限定 .py，跳过内部库与 __init__.py），返回相对 skillDir 的路径
function listScripts(dir: string, skillDir: string, out: string[]): void {
    let entries: string[]
    try {
        entries = fs.readdirSync(dir)
    } catch {
        return
    }
    for (const name of entries) {
        if (SKIP_DIRS.has(name) || SKIP_LIB_DIRS.has(name)) continue
        if (name.startsWith(".")) continue
        const full = path.join(dir, name)
        let stat
        try {
            stat = fs.lstatSync(full)
        } catch {
            continue
        }
        if (stat.isDirectory()) {
            listScripts(full, skillDir, out)
        } else if (stat.isFile() && name.endsWith(".py") && !SKIP_FILES.has(name)) {
            out.push(path.relative(skillDir, full))
        }
    }
}

// 解析 SKILL.md 顶部的 YAML frontmatter，返回 { name, description, body }
// 只取 name / description 两个字段（Anthropic Skill 约定的元数据），其余忽略
function parseFrontmatter(raw: string): { name: string; description: string; body: string } {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
    if (!m) return { name: "", description: "", body: raw }

    const yaml = m[1]
    const body = raw.slice(m[0].length)
    let name = ""
    let description = ""
    for (const line of yaml.split(/\r?\n/)) {
        const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
        if (!kv) continue
        const key = kv[1].toLowerCase()
        let val = kv[2].trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1)
        }
        if (key === "name") name = val
        else if (key === "description") description = val
    }
    return { name, description, body }
}

// 从 rootDir 扫描 skills/<name>/SKILL.md
// 不递归 docx/forms.md / pdf/reference.md 等，只取一级
export function loadSkills(rootDir: string): SkillMeta[] {
    const skillsRoot = path.join(rootDir, "src", "skills")
    if (!fs.existsSync(skillsRoot)) return []

    let entries: string[]
    try {
        entries = fs.readdirSync(skillsRoot)
    } catch {
        return []
    }

    const skills: SkillMeta[] = []
    for (const name of entries) {
        if (SKIP_DIRS.has(name)) continue
        if (name.startsWith(".")) continue
        const dir = path.join(skillsRoot, name)
        let stat
        try {
            stat = fs.lstatSync(dir)
        } catch {
            continue
        }
        if (!stat.isDirectory()) continue

        const skillFile = path.join(dir, "SKILL.md")
        if (!fs.existsSync(skillFile)) continue

        let raw = ""
        try {
            raw = fs.readFileSync(skillFile, { encoding: "utf8" })
        } catch {
            continue
        }

        const fm = parseFrontmatter(raw)
        const skillPath = path.relative(rootDir, dir)
        const scripts: string[] = []
        listScripts(dir, dir, scripts)

        skills.push({
            name: fm.name || name,
            description: fm.description,
            dir,
            skillPath,
            scripts,
            content: fm.body,
        })
    }
    return skills
}

// 把 skills 转成可读性好的 prompt 片段
export function formatSkillsSection(skills: SkillMeta[]): string {
    if (skills.length === 0) return ""

    const parts: string[] = []
    parts.push("## 可用 Skills")
    parts.push("")
    parts.push("每个 Skill 的 SKILL.md 与脚本路径都相对该 Skill 目录。调用脚本时用 run_command，并把 cwd 设为该 Skill 目录（下方逐个标注）。")
    parts.push("")

    for (const s of skills) {
        parts.push("### Skill: " + s.name)
        parts.push("")
        parts.push("- 目录（调用脚本时作为 run_command 的 cwd）：" + s.skillPath)
        if (s.scripts.length === 0) {
            parts.push("- 脚本：（无 .py 脚本）")
        } else {
            parts.push("- 脚本（相对该目录，用 run_command + args 数组调用）：")
            for (const sc of s.scripts) {
                parts.push("  - `python3 " + sc + " <args>`")
            }
        }
        parts.push("")
        parts.push("--- SKILL.md ---")
        parts.push("")
        parts.push(s.content)
        parts.push("")
        parts.push("--- /SKILL.md ---")
        parts.push("")
    }

    parts.push("## 何时调用 Skill")
    parts.push("")
    for (const s of skills) {
        parts.push("- **" + s.name + "**：" + (s.description || "（SKILL.md 未提供 description）"))
    }
    parts.push("")
    parts.push("- 调用方式：`run_command(command='python3', args=['" + (skills[0]?.scripts[0] || "<script>") + "', '<arg>'], cwd='" + (skills[0]?.skillPath || "<skill-dir>") + "')`")
    parts.push("- run_command 的 cwd 默认为仓库根；执行 Skill 脚本务必显式传 cwd（即上面的 Skill 目录），否则 SKILL.md 里的 `scripts/...` 相对路径会找不到。")
    parts.push("- 如果脚本依赖未安装（如 lxml），run_command 会失败 → 改用 pip 安装或换其他工具完成任务。")
    parts.push("")
    return parts.join("\n")
}

// 便捷函数：直接拼出完整 systemPrompt
export function buildSystemPrompt(base: string, rootDir: string): string {
    const section = formatSkillsSection(loadSkills(rootDir))
    if (!section) return base
    return base + "\n\n" + section
}
