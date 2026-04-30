let url = "http://localhost:11434/v1" // 地址
let apiKey = "" // key
let model = "qwen3.5" // 模型名称

let execArray: any = /https*:\/\/([^\/]+)(.+)?/.exec(url);
let hostport = execArray[1].split(":");

export default {
    request: /^https/.test(url) ? "https" : "http",
    hostname: hostport[0],
    port: hostport[1],
    path: execArray[2],
    apiKey,
    model
}