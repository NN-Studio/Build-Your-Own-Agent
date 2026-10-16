// @build-your-own-agent/use-skills
// 让 src/skills/<name>/SKILL.md 这类 Anthropic Skill 包生效：
// 把 SKILL.md 拼到已有的 systemPrompt 后面，模型据此通过 run_command 调用对应 python3 脚本

export { loadSkills, formatSkillsSection, buildSystemPrompt } from "./skills"
export type { SkillMeta } from "./skills"