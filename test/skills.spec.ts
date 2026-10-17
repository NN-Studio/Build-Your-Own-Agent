import { Unit } from "@oipage/testjs"
import * as path from "path"
import * as fs from "fs"

import {
    loadSkills,
    formatSkillsSection,
    buildSystemPrompt
} from "../packages/use-skills/src/skills"

const { describe, it, expect } = Unit.node()

const REPO_ROOT = path.resolve(__dirname, "..")
const SKILLS_ROOT = path.join(REPO_ROOT, "src", "skills")

// =============================================================================
// loadSkills：扫描 src/skills/*/SKILL.md（同步）
// =============================================================================

describe("use-skills/loadSkills", () => {

    it("扫描到三个内置 Skill（docx / pdf / pptx）", () => {
        const skills = loadSkills(REPO_ROOT)
        const names = skills.map((s) => s.name)
        expect(names.indexOf("docx") >= 0).toBe(true)
        expect(names.indexOf("pdf") >= 0).toBe(true)
        expect(names.indexOf("pptx") >= 0).toBe(true)
    })

    it("每个 Skill 都包含 SKILL.md 内容", () => {
        const skills = loadSkills(REPO_ROOT)
        expect(skills.length > 0).toBe(true)
        for (const s of skills) {
            expect(typeof s.content).toBe("string")
            expect(s.content.length > 0).toBe(true)
        }
    })

    it("每个 Skill 都收集到 .py 脚本", () => {
        const skills = loadSkills(REPO_ROOT)
        for (const s of skills) {
            expect(s.scripts.length > 0).toBe(true)
            for (const sc of s.scripts) {
                expect(sc.endsWith(".py")).toBe(true)
            }
        }
    })

    it("skillPath 是相对仓库根的路径", () => {
        const skills = loadSkills(REPO_ROOT)
        const docx = skills.find((s) => s.name === "docx")!
        expect(docx.skillPath).toBe("src/skills/docx")
        expect(docx.dir.startsWith(REPO_ROOT)).toBe(true)
    })

    it("scripts 是相对 skill 目录的路径，可拼出绝对路径并存在", () => {
        const skills = loadSkills(REPO_ROOT)
        const docx = skills.find((s) => s.name === "docx")!
        for (const sc of docx.scripts) {
            const abs = path.resolve(docx.dir, sc)
            expect(fs.existsSync(abs)).toBe(true)
        }
    })

    it("scripts 不含内部库文件（__init__.py / validators / helpers）", () => {
        const skills = loadSkills(REPO_ROOT)
        for (const s of skills) {
            for (const sc of s.scripts) {
                expect(sc.indexOf("__init__") >= 0).toBe(false)
                expect(sc.indexOf("/validators/") >= 0).toBe(false)
                expect(sc.indexOf("/helpers/") >= 0).toBe(false)
            }
        }
        // 入口脚本仍应保留
        const docx = skills.find((s) => s.name === "docx")!
        expect(docx.scripts.indexOf("scripts/merge_runs.py") >= 0).toBe(true)
        expect(docx.scripts.indexOf("scripts/office/validate.py") >= 0).toBe(true)
    })

    it("解析 SKILL.md frontmatter 得到 description", () => {
        const skills = loadSkills(REPO_ROOT)
        const docx = skills.find((s) => s.name === "docx")!
        expect(docx.description.length > 0).toBe(true)
        expect(docx.description.indexOf("Word") >= 0).toBe(true)
    })

    it("一级目录里没有 SKILL.md 的子目录会被跳过", () => {
        // 在临时目录下建一个 fake root，里面放一个无 SKILL.md 的子目录
        const tmp = path.join(REPO_ROOT, ".cache", "skills-spec-fake")
        const fakeSkills = path.join(tmp, "src", "skills")
        fs.mkdirSync(path.join(fakeSkills, "noSkillMd"), { recursive: true })
        fs.mkdirSync(path.join(fakeSkills, "hasSkillMd"), { recursive: true })
        fs.writeFileSync(path.join(fakeSkills, "hasSkillMd", "SKILL.md"), "# hi")

        const skills = loadSkills(tmp)
        const names = skills.map((s) => s.name)
        expect(names.indexOf("hasSkillMd") >= 0).toBe(true)
        expect(names.indexOf("noSkillMd") >= 0).toBe(false)

        fs.rmSync(tmp, { recursive: true, force: true })
    })

    it("对不存在 src/skills 的目录返回空数组", () => {
        const tmp = path.join(REPO_ROOT, ".cache", "skills-spec-empty")
        fs.mkdirSync(tmp, { recursive: true })
        const skills = loadSkills(tmp)
        expect(Array.isArray(skills)).toBe(true)
        expect(skills.length).toBe(0)
        fs.rmSync(tmp, { recursive: true, force: true })
    })
})

// =============================================================================
// formatSkillsSection：拼 systemPrompt 片段
// =============================================================================

describe("use-skills/formatSkillsSection", () => {

    it("空数组返回空字符串", () => {
        expect(formatSkillsSection([])).toBe("")
    })

    it("生成的片段包含 '## 可用 Skills' 标题", () => {
        const skills = loadSkills(REPO_ROOT)
        const out = formatSkillsSection(skills)
        expect(out.indexOf("## 可用 Skills") >= 0).toBe(true)
    })

    it("包含每个 Skill 的 SKILL.md 全文（用 --- SKILL.md --- 包围）", () => {
        const skills = loadSkills(REPO_ROOT)
        const out = formatSkillsSection(skills)
        expect(out.indexOf("--- SKILL.md ---") >= 0).toBe(true)
        expect(out.indexOf("--- /SKILL.md ---") >= 0).toBe(true)
        // docx 的 SKILL.md 里有 'DOCX' 字样
        expect(out.indexOf("DOCX") >= 0).toBe(true)
        // frontmatter 已被剥离，不再把 license 之类的 YAML 噪声注入 prompt
        expect(out.indexOf("license:") >= 0).toBe(false)
    })

    it("末尾的 '何时调用 Skill' 段落存在，且由 description 与 cwd 说明构成", () => {
        const skills = loadSkills(REPO_ROOT)
        const out = formatSkillsSection(skills)
        expect(out.indexOf("## 何时调用 Skill") >= 0).toBe(true)
        expect(out.indexOf("run_command") >= 0).toBe(true)
        // 用 frontmatter 的 description 说明何时该用该 skill
        expect(out.indexOf("Use this skill") >= 0).toBe(true)
        // 明确要求显式传 cwd（路径基准统一为 skill 目录）
        expect(out.indexOf("cwd") >= 0).toBe(true)
    })

    it("脚本以 'python3' 开头列出", () => {
        const skills = loadSkills(REPO_ROOT)
        const out = formatSkillsSection(skills)
        expect(out.indexOf("python3 ") >= 0).toBe(true)
    })
})

// =============================================================================
// buildSystemPrompt：便捷拼接
// =============================================================================

describe("use-skills/buildSystemPrompt", () => {

    it("无 skills 时返回 base", () => {
        const tmp = path.join(REPO_ROOT, ".cache", "skills-spec-bp-empty")
        fs.mkdirSync(tmp, { recursive: true })
        const out = buildSystemPrompt("BASE-PROMPT", tmp)
        expect(out).toBe("BASE-PROMPT")
        fs.rmSync(tmp, { recursive: true, force: true })
    })

    it("有 skills 时把 Skill 段落拼到 base 后面", () => {
        const out = buildSystemPrompt("BASE-PROMPT", REPO_ROOT)
        expect(out.startsWith("BASE-PROMPT")).toBe(true)
        expect(out.indexOf("## 可用 Skills") >= 0).toBe(true)
        expect(out.indexOf("\n\n## 可用 Skills") >= 0).toBe(true)
    })
})

// =============================================================================
// 与文件系统的一致性：保证扫描规则真实可用
// =============================================================================

describe("use-skills/与文件系统一致性", () => {

    it("三个 Skill 目录全部存在且可被 loadSkills 命中", () => {
        expect(fs.existsSync(SKILLS_ROOT)).toBe(true)
        const skills = loadSkills(REPO_ROOT)
        for (const name of ["docx", "pdf", "pptx"]) {
            expect(fs.existsSync(path.join(SKILLS_ROOT, name))).toBe(true)
            expect(skills.find((s) => s.name === name)).not.toBe(undefined)
        }
    })
})