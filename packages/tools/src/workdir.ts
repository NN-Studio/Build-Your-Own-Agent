// 沙箱：路径白名单校验
// 仓库根 + packages/*/src 视为可访问区域
// 所有工具的路径参数都先过 isPathAllowed，避免越权读写

import * as path from "path"

// packages/tools/src/workdir.ts → 仓库根 = ../../../
const REPO_ROOT = path.resolve(__dirname, "../../../")

function resolveSafe(p: string): string {
    return path.isAbsolute(p)
        ? path.normalize(p)
        : path.normalize(path.resolve(REPO_ROOT, p))
}

export function repoRoot(): string {
    return REPO_ROOT
}

export function isPathAllowed(p: string): boolean {
    if (!p || typeof p !== "string") return false
    const abs = resolveSafe(p)
    const rel = path.relative(REPO_ROOT, abs)
    if (rel.startsWith("..") || path.isAbsolute(rel)) return false
    return true
}

export function isInPackagesSrc(p: string): boolean {
    const abs = resolveSafe(p)
    const rel = path.relative(REPO_ROOT, abs)
    return /^packages\/[^/]+\/src(\/|$)/.test(rel)
}

// 工具通用：把任意输入路径解析为仓库内绝对路径
export function toAbsolute(p: string): string {
    return resolveSafe(p)
}