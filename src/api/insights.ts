/**
 * 评测对比 REST 客户端（P7.6）
 */

import type { CompareData, RecentTrace, VersionSummary } from '../types/insights'

const API_BASE = 'http://localhost:8000'

async function json<T>(resp: Response): Promise<T> {
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json() as Promise<T>
}

export async function fetchVersions(): Promise<VersionSummary[]> {
  return json(await fetch(`${API_BASE}/api/insights/versions`))
}

export async function fetchCompare(v1: string, v2: string): Promise<CompareData> {
  return json(await fetch(`${API_BASE}/api/insights/compare?versions=${v1},${v2}`))
}

export async function fetchRecentRuns(version: string, limit = 5): Promise<RecentTrace[]> {
  return json(await fetch(`${API_BASE}/api/insights/runs?version=${version}&limit=${limit}`))
}
