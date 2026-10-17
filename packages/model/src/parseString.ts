// 字符串转 JSON：兼容 SSE 边界缺失的 LLM 后端（如 MiniMax-M3 偶尔丢 data: 前缀、
// 或把多条 data: 行拼在一起、或在一行的中间断开）。原则：
//   1) 按"大括号配平"切出每条 SSE 事件体（不再依赖严格的 \n\ndata: 分隔）
//   2) 逐条 JSON.parse，坏掉的 chunk 静默丢弃，不让单条坏数据把整轮 reject
//   3) 兼容 [DONE]、无 data: 前缀、同一条里多事件拼一起
export default function (value: string): any {
    if (!value) return []
    // 去 [DONE]、首尾空白
    const cleaned = value.replace(/data:\s*\[DONE\]\s*/g, "").trim()
    if (!cleaned) return []

    // 情况 A：已经是单个 JSON 对象（含 { 或 [）→ 直接解析
    if ((cleaned.startsWith("{") && cleaned.endsWith("}")) ||
        (cleaned.startsWith("[") && cleaned.endsWith("]"))) {
        try {
            return JSON.parse(cleaned)
        } catch {
            // 不是合法 JSON，继续走按括号切片的兜底
        }
    }

    // 按大括号配平切出每条事件。
    // 每条事件形如：data: {...} 或裸 {...}，优先尝试 data: 前缀；否则按括号配平。
    const events: string[] = []
    let i = 0
    const n = cleaned.length
    while (i < n) {
        // 跳过空白
        while (i < n && /\s/.test(cleaned[i])) i++
        if (i >= n) break

        // 兼容 data: 前缀
        if (cleaned.startsWith("data:", i)) {
            i += "data:".length
            while (i < n && cleaned[i] === " ") i++
        }

        // 下一段必须是 JSON 对象开始
        if (cleaned[i] !== "{") {
            // 既不是 data:，也不是 { —— 跳过这一字符
            i++
            continue
        }

        // 按括号配平找到对应的 }
        let depth = 0
        let inStr = false
        let escape = false
        let start = i
        for (; i < n; i++) {
            const ch = cleaned[i]
            if (inStr) {
                if (escape) { escape = false; continue }
                if (ch === "\\") { escape = true; continue }
                if (ch === '"') inStr = false
            } else {
                if (ch === '"') inStr = true
                else if (ch === "{") depth++
                else if (ch === "}") {
                    depth--
                    if (depth === 0) { i++; break }
                }
            }
        }
        events.push(cleaned.slice(start, i))
    }

    const parsed: any[] = []
    for (const ev of events) {
        const body = ev.trim()
        if (!body || body === "[DONE]") continue
        try {
            parsed.push(JSON.parse(body))
        } catch {
            // 坏 chunk：丢掉，下一条继续。MiniMax-M3 偶发坏 data 不要炸整轮
        }
    }

    if (parsed.length === 0) return []
    if (parsed.length === 1) return parsed[0]
    return parsed
}