import * as fs from "fs"
import * as path from "path"
import { ResourceDefinition } from "../types"
import { repoRoot } from "../sandbox"

// 把仓库内的若干关键文件暴露为 MCP resources
const ROOT = repoRoot()
const RESOURCE_FILES: { abs: string; mime: string }[] = [
    { abs: path.join(ROOT, "README.md"), mime: "text/markdown" },
    { abs: path.join(ROOT, "config.ts"), mime: "text/typescript" },
    { abs: path.join(ROOT, "package.json"), mime: "application/json" },
    { abs: path.join(ROOT, "tsconfig.json"), mime: "application/json" }
]

const RESOURCE_DIRS = ["skills", "packages/agent/src", "packages/model/src", "packages/mcp-server/src"]

export function handleResourcesList(_params: any) {
    const resourcesOut: ResourceDefinition[] = []

    for (const f of RESOURCE_FILES) {
        if (fs.existsSync(f.abs)) {
            resourcesOut.push({
                uri: "file://" + f.abs,
                name: path.relative(ROOT, f.abs),
                mimeType: f.mime
            })
        }
    }

    for (const dir of RESOURCE_DIRS) {
        const abs = path.join(ROOT, dir)
        if (!fs.existsSync(abs)) continue
        const entries = fs.readdirSync(abs)
        for (const e of entries) {
            if (!/\.(ts|md|json)$/.test(e)) continue
            const fileAbs = path.join(abs, e)
            const mime = e.endsWith(".md") ? "text/markdown"
                : e.endsWith(".json") ? "application/json"
                : "text/typescript"
            resourcesOut.push({
                uri: "file://" + fileAbs,
                name: path.relative(ROOT, fileAbs),
                mimeType: mime
            })
        }
    }

    return { resources: resourcesOut }
}