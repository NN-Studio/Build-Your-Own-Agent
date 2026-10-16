// 工具注册表
import { ToolDefinition, ToolCallResult } from "../types"
import { read_file, read_file_handler } from "./read_file"
import { list_dir, list_dir_handler } from "./list_dir"
import { search_code, search_code_handler } from "./search_code"
import { run_command, run_command_handler } from "./run_command"

export const tools: ToolDefinition[] = [read_file, list_dir, search_code, run_command]

export const toolHandlers: Record<string, (args: any) => Promise<ToolCallResult>> = {
    [read_file.name]: read_file_handler,
    [list_dir.name]: list_dir_handler,
    [search_code.name]: search_code_handler,
    [run_command.name]: run_command_handler
}