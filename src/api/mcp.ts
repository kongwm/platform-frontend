/**
 * MCP 管理 REST 客户端
 */

const API_BASE = 'http://localhost:8000'

export interface McpToolInfo {
  name: string
  agent_name: string
}

export interface McpServerInfo {
  name: string
  status: 'running' | 'stopped' | 'error'
  command: string
  optional: boolean
  tools: McpToolInfo[]
}

export interface McpStatus {
  enabled: boolean
  servers: McpServerInfo[]
}

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json() as Promise<T>
}

export async function fetchMcpStatus(): Promise<McpStatus> {
  return json(await fetch(`${API_BASE}/api/mcp/status`))
}

export async function reloadMcp(): Promise<McpStatus> {
  return json(await fetch(`${API_BASE}/api/mcp/reload`, { method: 'POST' }))
}
