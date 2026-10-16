// MCP / JSON-RPC 2.0 的核心类型
// 参考：https://modelcontextprotocol.io/specification/2024-11-05

// ============ JSON-RPC 2.0 ============

export interface JsonRpcRequest {
    jsonrpc: "2.0"
    id: string | number
    method: string
    params?: any
}

export interface JsonRpcNotification {
    jsonrpc: "2.0"
    method: string
    params?: any
}

export interface JsonRpcSuccess {
    jsonrpc: "2.0"
    id: string | number
    result: any
}

export interface JsonRpcError {
    jsonrpc: "2.0"
    id: string | number | null
    error: {
        code: number
        message: string
        data?: any
    }
}

export type JsonRpcFrame = JsonRpcRequest | JsonRpcNotification

// 标准错误码
export const ErrorCode = {
    ParseError: -32700,
    InvalidRequest: -32600,
    MethodNotFound: -32601,
    InvalidParams: -32602,
    InternalError: -32603
} as const

// ============ MCP 类型 ============

export interface InitializeParams {
    protocolVersion: string
    capabilities: any
    clientInfo: { name: string; version: string }
}

export interface InitializeResult {
    protocolVersion: string
    capabilities: {
        tools?: { listChanged?: boolean }
        resources?: { subscribe?: boolean; listChanged?: boolean }
    }
    serverInfo: { name: string; version: string }
}

// 工具描述（与 OpenAI function calling 兼容）
export interface ToolDefinition {
    name: string
    description: string
    inputSchema: {
        type: "object"
        properties: Record<string, any>
        required?: string[]
    }
}

// 工具执行结果
export interface ToolCallResult {
    content: Array<{ type: "text"; text: string }>
    isError?: boolean
}

// 资源描述
export interface ResourceDefinition {
    uri: string
    name: string
    description?: string
    mimeType?: string
}

export interface ReadResourceResult {
    contents: Array<{
        uri: string
        mimeType?: string
        text?: string
        blob?: string
    }>
}