// @build-your-own-agent/tools
// 暴露 OpenAI function calling 格式的工具集 + 基础系统提示
// 直接喂给 Agent({ tools, systemPrompt }) 即可

import { list_dir } from "./list_dir"
import { read_file } from "./read_file"
import { write_file } from "./write_file"
import { edit_file } from "./edit_file"
import { search_code } from "./search_code"
import { search_text } from "./search_text"
import { run_command } from "./run_command"

export { list_dir } from "./list_dir"
export { read_file } from "./read_file"
export { write_file } from "./write_file"
export { edit_file } from "./edit_file"
export { search_code } from "./search_code"
export { search_text } from "./search_text"
export { run_command } from "./run_command"

// 工具清单（顺序：信息获取 → 修改 → 执行）
export const tools = [list_dir, read_file, search_code, search_text, write_file, edit_file, run_command]