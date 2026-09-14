/**
 * 评测对比页类型（P7.6）—— 与后端 services/insights.py 的返回结构一一对应
 */

import type { TraceEvent } from './sse'

/** 版本摘要（/insights/versions，下拉框 + 汇总行） */
export interface VersionSummary {
  version: string
  run_count: number
  first_seen: string
  last_seen: string
  eval_total: number
  eval_passed: number
}

/** run 级聚合（/insights/compare） */
export interface RunStats {
  run_count: number
  avg_wall_ms: number
  max_wall_ms: number
  avg_iters: number
  avg_tokens: number
}

/** 单工具聚合：调用次数 + 平均延迟 */
export interface ToolStat {
  calls: number
  avg_ms: number
}

/** 单用例最新结果 */
export interface CaseResult {
  passed: boolean
  wall_s: number | null
  failures: string[]
}

/** 对比的一侧（一个版本） */
export interface SideStats {
  version: string
  runs: RunStats
  tools: Record<string, ToolStat>
  eval: { total: number; passed: number; cases: Record<string, CaseResult> }
}

export interface CompareData {
  v1: SideStats
  v2: SideStats
}

/** 最近 run 轨迹（/insights/runs，展开复用 TraceView） */
export interface RecentTrace {
  id: string
  trace: TraceEvent[]
  wall_ms: number
  created_at: string
}
