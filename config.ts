let { url, apiKey, model } = {

    // 环境一：Ollama
    // ollama serve
    "ollama": {
        url: "http://localhost:11434/v1",
        apiKey: "",
        model: "qwen3.5"
    },

    // 环境二：llama.cpp
    // ./build/bin/llama-server -m ../Qwen3.5-9B-Q5_K_M.gguf --host 0.0.0.0 --port 8080
    // 模型地址： https://hf-mirror.com/unsloth/Qwen3.5-9B-GGUF
    "llama.cpp": {
        url: "http://localhost:8080/v1",
        apiKey: "",
        model: ""
    },

    // 环境三：py3model
    // https://pypi.org/project/py3model/
    "py3model": {
        url: "http://localhost:11435/v1",
        apiKey: "",
        model: "qwen3.5"
    },

    "other": {
        url: "",
        apiKey: "",
        model: ""
    }

}
["ollama"]
// ["llama.cpp"]
// ["py3model"],
// ["other"]

let execArray: any = /https*:\/\/([^\/]+)(.+)?/.exec(url)
let hostport = execArray[1].split(":")

export default {
    request: /^https/.test(url) ? "https" : "http",
    hostname: hostport[0],
    port: hostport[1],
    path: execArray[2],
    apiKey,
    model
}