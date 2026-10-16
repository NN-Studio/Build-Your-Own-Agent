import * as fs from "fs"
import { isPathAllowed } from "../sandbox"
import { ReadResourceResult } from "../types"

interface ReadParams { uri: string }

export async function handleResourcesRead(params: ReadParams): Promise<ReadResourceResult> {
    const uri = params?.uri
    if (!uri || typeof uri !== "string" || !uri.startsWith("file://")) {
        return {
            contents: [{
                uri: uri || "(invalid)",
                mimeType: "text/plain",
                text: "uri 必须以 file:// 开头"
            }]
        }
    }

    // file:// 后面的路径就是绝对路径
    let abs: string
    try {
        abs = decodeURIComponent(uri.slice("file://".length))
    } catch {
        abs = uri.slice("file://".length)
    }

    if (!isPathAllowed(abs)) {
        return {
            contents: [{
                uri,
                mimeType: "text/plain",
                text: "路径越界"
            }]
        }
    }

    if (!fs.existsSync(abs)) {
        return {
            contents: [{
                uri,
                mimeType: "text/plain",
                text: "文件不存在"
            }]
        }
    }

    const text = fs.readFileSync(abs, "utf8")
    return {
        contents: [{
            uri,
            mimeType: "text/plain",
            text
        }]
    }
}