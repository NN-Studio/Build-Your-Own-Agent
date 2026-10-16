import { InitializeResult } from "../types"

export const PROTOCOL_VERSION = "2024-11-05"
export const SERVER_INFO = { name: "@build-your-own-agent/mcp-server", version: "0.1.0" }

export function handleInitialize(_params: any): InitializeResult {
    return {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
            tools: {},
            resources: {}
        },
        serverInfo: SERVER_INFO
    }
}