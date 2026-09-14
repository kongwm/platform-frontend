/**
 * 会话/项目管理 REST 客户端（侧边栏数据源）
 */

import type { RunTrace, ToolCall, UiMessage } from '../types/sse'

const API_BASE = 'http://localhost:8000'

export interface Conversation {
  id: string
  title: string
  project_id: string | null
  project_name: string | null
  input_tokens: number
  output_tokens: number
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  name: string
  type: 'project' | 'tag'
  conv_count: number
}

/** 后端返回的原始消息（Anthropic 块列表） */
export interface RawMessage {
  role: 'user' | 'assistant' | 'summary'
  content: Array<Record<string, unknown>>
}

/** messages 接口完整响应（P4 起附带产出物，P7 起附带运行轨迹） */
export interface MessagesResponse {
  conversation: Conversation
  messages: RawMessage[]
  artifacts: Array<{ id: string; type: 'pdf' | 'image' | 'md'; filename: string; created_at: string; url: string }>
  /** 顺序对齐约定：第 N 个 trace ↔ 第 N 轮用户提问 */
  traces: RunTrace[]
}

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json() as Promise<T>
}

export async function fetchConversations(): Promise<Conversation[]> {
  return json(await fetch(`${API_BASE}/api/conversations`))
}

export async function fetchMessages(id: string): Promise<MessagesResponse> {
  return json(await fetch(`${API_BASE}/api/conversations/${id}/messages`))
}

export async function renameConversation(id: string, title: string): Promise<void> {
  await fetch(`${API_BASE}/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

/** 移动会话到项目；projectId 传 null = 移回默认分组（后端约定空字符串） */
export async function moveConversation(id: string, projectId: string | null): Promise<void> {
  await fetch(`${API_BASE}/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId ?? '' }),
  })
}

export async function deleteConversation(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/conversations/${id}`, { method: 'DELETE' })
}

export async function fetchProjects(): Promise<Project[]> {
  return json(await fetch(`${API_BASE}/api/projects`))
}

export async function createProject(name: string, type: 'project' | 'tag' = 'project'): Promise<Project> {
  return json(
    await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type }),
    }),
  )
}

export async function deleteProject(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/projects/${id}`, { method: 'DELETE' })
}

/** historyAdapter 会用到的类型重导出（避免循环依赖） */
export type { UiMessage, ToolCall }
