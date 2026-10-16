// Sandbox：路径白名单校验
// 仓库根 + packages/*/src 视为可访问区域
// 用于 read_file / list_dir / run_command 的安全校验

import * as path from "path"

const REPO_ROOT = path.resolve(__dirname, "../../../")

function resolveSafe(p: string): string {
    // 解析为绝对路径
    return path.isAbsolute(p)
        ? path.normalize(p)
        : path.normalize(path.resolve(REPO_ROOT, p))
}

export function isPathAllowed(p: string): boolean {
    const abs = resolveSafe(p)
    // 必须在仓库根内
    const rel = path.relative(REPO_ROOT, abs)
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        return false
    }
    return true
}

// 检查是否落在 packages/*/src
export function isInPackagesSrc(p: string): boolean {
    const abs = resolveSafe(p)
    const rel = path.relative(REPO_ROOT, abs)
    return /^packages\/[^/]+\/src(\/|$)/.test(rel)
}

export function repoRoot(): string {
    return REPO_ROOT
}