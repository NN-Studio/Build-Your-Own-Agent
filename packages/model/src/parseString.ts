// 字符串转JSON
// 适配LLM返回数据格式
export default function (value: string) {
    try {
        value = value.trim().replace(/^data: /, "").replace(/data: \[DONE\]$/, "")
        return JSON.parse(value)
    } catch (e) {
        throw new Error("[转json失败]" + value)
    }
}