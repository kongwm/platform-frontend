/**
 * 知识库管理 REST 客户端
 */

const API_BASE = 'http://localhost:8000'

export interface KbDoc {
  id: string
  filename: string
  status: 'pending' | 'done' | 'error'
  chunk_count: number
  error: string | null
  created_at: string
}

export interface SearchResult {
  filename: string
  heading: string
  score: number
  text: string
}

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}))
    throw new Error(body.detail || `HTTP ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

export async function uploadDoc(file: File): Promise<KbDoc> {
  const form = new FormData()
  form.append('file', file)
  return json(await fetch(`${API_BASE}/api/kb/upload`, { method: 'POST', body: form }))
}

export async function fetchDocs(): Promise<KbDoc[]> {
  return json(await fetch(`${API_BASE}/api/kb/docs`))
}

export async function deleteDoc(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/kb/docs/${id}`, { method: 'DELETE' })
}

export async function reindexDoc(id: string): Promise<{ chunk_count: number }> {
  return json(await fetch(`${API_BASE}/api/kb/docs/${id}/reindex`, { method: 'POST' }))
}

/** 调试端点：绕过 Agent 直接看检索质量 */
export async function searchTest(q: string, topK = 4): Promise<SearchResult[]> {
  const data = await json<{ results: SearchResult[] }>(
    await fetch(`${API_BASE}/api/kb/search?q=${encodeURIComponent(q)}&top_k=${topK}`),
  )
  return data.results
}
