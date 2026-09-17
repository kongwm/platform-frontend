/**
 * 长期记忆管理 REST 客户端
 */

const API_BASE = 'http://localhost:8000'

export interface MemoryItem {
  id: string
  content: string
  type: 'fact' | 'preference'
  source: 'auto' | 'tool' | 'manual'
  conversation_id: string | null
  created_at: string
  updated_at: string
}

export interface MemorySearchResult {
  id: string
  type: 'fact' | 'preference'
  score: number
  content: string
}

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

export async function fetchMemories(limit = 200): Promise<MemoryItem[]> {
  return json(await fetch(`${API_BASE}/api/memories?limit=${limit}`))
}

export async function addMemory(content: string, type: 'fact' | 'preference'): Promise<MemoryItem> {
  return json(
    await fetch(`${API_BASE}/api/memories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, type }),
    }),
  )
}

export async function updateMemory(id: string, content: string): Promise<MemoryItem> {
  return json(
    await fetch(`${API_BASE}/api/memories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }),
  )
}

export async function deleteMemory(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/memories/${id}`, { method: 'DELETE' })
}

/** 调试端点：人眼验证记忆检索质量（面板里的语义搜索框） */
export async function searchMemories(q: string, topK = 4): Promise<MemorySearchResult[]> {
  const data = await json<{ results: MemorySearchResult[] }>(
    await fetch(`${API_BASE}/api/memories/search?q=${encodeURIComponent(q)}&top_k=${topK}`),
  )
  return data.results
}
