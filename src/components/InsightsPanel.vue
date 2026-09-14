<script setup lang="ts">
/**
 * 评测对比页（P7.6）—— "后端优化前后到底有没有变好"的答案页
 *
 * 数据三来源（都是只读聚合，无 SSE）：
 *   /insights/versions → 版本下拉框
 *   /insights/compare  → 指标卡 / 工具延迟 / 用例表
 *   /insights/runs     → 两个版本各最近 5 条 run（展开复用 TraceView 回放）
 *
 * 图表零依赖：条形 = div 宽度百分比（宽度按 A/B 中的较大值归一化），
 * 与 TraceView 的手写风格一致。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { fetchCompare, fetchRecentRuns, fetchVersions } from '../api/insights'
import type { CompareData, RecentTrace, VersionSummary } from '../types/insights'
import TraceView from './TraceView.vue'

const versions = ref<VersionSummary[]>([])
const selA = ref('')
const selB = ref('')
const compare = ref<CompareData | null>(null)
const runsA = ref<RecentTrace[]>([])
const runsB = ref<RecentTrace[]>([])
const error = ref('')
const loading = ref(false)

const label = (v: string) => (v ? v : '未知（历史数据）')

onMounted(async () => {
  try {
    versions.value = await fetchVersions()
    // 默认选最近两个版本（接口按首次出现倒序，第一个 = 最新）
    selA.value = versions.value[0]?.version ?? ''
    selB.value = versions.value[1]?.version ?? ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

watch([selA, selB], () => { if (selA.value || selB.value) loadAll() })

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const a = selA.value
    const b = selB.value
    // A、B 选了同一个版本时 compare 也能出（和自己比，delta 全 0），不拦
    const [cmp, ra, rb] = await Promise.all([
      fetchCompare(a, b),
      a ? fetchRecentRuns(a) : Promise.resolve([]),
      b ? fetchRecentRuns(b) : Promise.resolve([]),
    ])
    compare.value = cmp
    runsA.value = ra
    runsB.value = rb
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

// === 指标卡：把两版数据拍平成 {name, a, b, fmt, lowerBetter} 数组 ===
interface Metric {
  name: string
  a: number
  b: number
  fmt: (n: number) => string
  lowerBetter: boolean
}

const fmtMs = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`)
const fmtTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)))
const fmtPct = (n: number) => `${Math.round(n)}%`

const metrics = computed<Metric[]>(() => {
  const c = compare.value
  if (!c) return []
  const passRate = (s: typeof c.v1) =>
    s.eval.total ? (s.eval.passed / s.eval.total) * 100 : 0
  return [
    { name: '平均耗时 / 轮', a: c.v1.runs.avg_wall_ms, b: c.v2.runs.avg_wall_ms, fmt: fmtMs, lowerBetter: true },
    { name: 'tokens / 轮', a: c.v1.runs.avg_tokens, b: c.v2.runs.avg_tokens, fmt: fmtTok, lowerBetter: true },
    { name: '平均迭代数', a: c.v1.runs.avg_iters, b: c.v2.runs.avg_iters, fmt: (n) => n.toFixed(1), lowerBetter: true },
    { name: 'eval 通过率', a: passRate(c.v1), b: passRate(c.v2), fmt: fmtPct, lowerBetter: false },
  ]
})

/** 条形宽度：按 A/B 较大值归一化（两版都为 0 时 0%） */
function barW(v: number, other: number): string {
  const max = Math.max(v, other)
  return max > 0 ? `${Math.min(100, (v / max) * 100)}%` : '0%'
}

/** delta 徽标：v2 相对 v1 变化百分比；improvement 按"越低越好/越高越好"定色 */
function delta(m: Metric): { text: string; good: boolean } | null {
  if (!m.a) return null
  const pct = Math.round(((m.b - m.a) / m.a) * 100)
  if (pct === 0) return { text: '±0%', good: true }
  const good = m.lowerBetter ? pct < 0 : pct > 0
  return { text: `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`, good }
}

/** 工具延迟对比行：两版本工具名的并集，按平均延迟降序 */
interface ToolRow { name: string; a: { calls: number; avg_ms: number } | null; b: { calls: number; avg_ms: number } | null }
const toolRows = computed<ToolRow[]>(() => {
  const c = compare.value
  if (!c) return []
  const names = new Set([...Object.keys(c.v1.tools), ...Object.keys(c.v2.tools)])
  return [...names]
    .map((name) => ({ name, a: c.v1.tools[name] ?? null, b: c.v2.tools[name] ?? null }))
    .sort((x, y) =>
      Math.max(y.a?.avg_ms ?? 0, y.b?.avg_ms ?? 0) - Math.max(x.a?.avg_ms ?? 0, x.b?.avg_ms ?? 0))
})

/** 用例表行：两版本 case id 的并集 */
interface CaseRow { id: string; a: boolean | null; b: boolean | null; aWall: number | null; bWall: number | null }
const caseRows = computed<CaseRow[]>(() => {
  const c = compare.value
  if (!c) return []
  const ids = new Set([...Object.keys(c.v1.eval.cases), ...Object.keys(c.v2.eval.cases)])
  return [...ids].sort().map((id) => ({
    id,
    a: c.v1.eval.cases[id]?.passed ?? null,
    b: c.v2.eval.cases[id]?.passed ?? null,
    aWall: c.v1.eval.cases[id]?.wall_s ?? null,
    bWall: c.v2.eval.cases[id]?.wall_s ?? null,
  }))
})
</script>

<template>
  <main class="insights">
    <header class="head">
      <h2>📊 评测对比</h2>
      <p class="sub">对比两个后端版本（git commit）的运行轨迹聚合与 eval 通过情况。优化流程：改代码 → commit → 跑 eval → 回到这里看 delta。</p>
      <div class="selectors">
        <label>A <select v-model="selA">
          <option v-for="v in versions" :key="v.version" :value="v.version">{{ label(v.version) }}（{{ v.run_count }} runs）</option>
        </select></label>
        <span class="vs">vs</span>
        <label>B <select v-model="selB">
          <option v-for="v in versions" :key="v.version" :value="v.version">{{ label(v.version) }}（{{ v.run_count }} runs）</option>
        </select></label>
      </div>
    </header>

    <div v-if="error" class="error">⚠️ {{ error }}</div>
    <div v-if="!versions.length && !error" class="empty">还没有任何 run 数据 —— 去对话几轮或跑一次 eval（scripts/eval_run.py），数据落库后这里自动出现。</div>

    <template v-if="compare">
      <!-- 指标卡：A/B 两根条 + delta 徽标 -->
      <section class="cards">
        <div v-for="m in metrics" :key="m.name" class="card">
          <div class="card-head">
            <span class="card-name">{{ m.name }}</span>
            <span v-if="delta(m)" class="badge" :class="delta(m)!.good ? 'good' : 'bad'">{{ delta(m)!.text }}</span>
          </div>
          <div class="bar-row">
            <span class="bar-label" :title="label(compare.v1.version)">{{ label(compare.v1.version).slice(0, 7) }}</span>
            <div class="bar-track"><div class="bar a" :style="{ width: barW(m.a, m.b) }"></div></div>
            <span class="bar-val">{{ m.fmt(m.a) }}</span>
          </div>
          <div class="bar-row">
            <span class="bar-label" :title="label(compare.v2.version)">{{ label(compare.v2.version).slice(0, 7) }}</span>
            <div class="bar-track"><div class="bar b" :style="{ width: barW(m.b, m.a) }"></div></div>
            <span class="bar-val">{{ m.fmt(m.b) }}</span>
          </div>
        </div>
      </section>

      <!-- 工具延迟对比 -->
      <section v-if="toolRows.length" class="block">
        <h3>🔧 工具调用（次数 · 平均延迟）</h3>
        <div v-for="t in toolRows" :key="t.name" class="tool-row">
          <span class="tool-name" :title="t.name">{{ t.name }}</span>
          <div class="tool-bars">
            <div class="bar-track"><div class="bar a" :style="{ width: barW(t.a?.avg_ms ?? 0, t.b?.avg_ms ?? 0) }"></div></div>
            <div class="bar-track"><div class="bar b" :style="{ width: barW(t.b?.avg_ms ?? 0, t.a?.avg_ms ?? 0) }"></div></div>
          </div>
          <span class="tool-vals">
            A: {{ t.a ? `${t.a.calls}次 ${fmtMs(t.a.avg_ms)}` : '—' }} ·
            B: {{ t.b ? `${t.b.calls}次 ${fmtMs(t.b.avg_ms)}` : '—' }}
          </span>
        </div>
      </section>

      <!-- eval 用例对比表 -->
      <section v-if="caseRows.length" class="block">
        <h3>🧪 eval 用例（{{ compare.v2.eval.passed }}/{{ compare.v2.eval.total }} vs {{ compare.v1.eval.passed }}/{{ compare.v1.eval.total }}）</h3>
        <table class="cases">
          <thead><tr><th>用例</th><th>A</th><th>B</th><th>耗时 A → B</th></tr></thead>
          <tbody>
            <tr v-for="row in caseRows" :key="row.id">
              <td>{{ row.id }}</td>
              <td><span :class="row.a === null ? 'na' : row.a ? 'pass' : 'fail'">{{ row.a === null ? '—' : row.a ? '✅' : '❌' }}</span></td>
              <td><span :class="row.b === null ? 'na' : row.b ? 'pass' : 'fail'">{{ row.b === null ? '—' : row.b ? '✅' : '❌' }}</span></td>
              <td class="wall">{{ row.aWall ?? '—' }}s → {{ row.bWall ?? '—' }}s</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- 最近 run 回放（复用 P7 TraceView） -->
      <section class="block runs">
        <div v-for="(runs, side) in [{ v: compare.v1, list: runsA }, { v: compare.v2, list: runsB }]" :key="side" class="run-col">
          <h3>🗂 {{ label(runs.v.version) }} 最近 runs</h3>
          <details v-for="r in runs.list" :key="r.id" class="run">
            <summary>{{ r.created_at }} · {{ fmtMs(r.wall_ms) }} · {{ r.trace.length }} 事件</summary>
            <TraceView :trace="{ trace: r.trace, wall_ms: r.wall_ms }" />
          </details>
          <div v-if="!runs.list.length" class="empty">该版本没有 run 记录</div>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.insights {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  background: var(--bg);
}
.head h2 { margin-bottom: 4px; }
.sub {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 12px;
}
.selectors {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}
.selectors select {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  max-width: 240px;
}
.vs { color: #9ca3af; font-weight: 600; }
.error {
  margin-top: 12px;
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  border-radius: 8px;
  font-size: 13px;
}
.empty {
  margin-top: 24px;
  color: #9ca3af;
  font-size: 13px;
  text-align: center;
}

/* === 指标卡 === */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.card-name { font-size: 13px; font-weight: 600; }
.badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
}
.badge.good { background: #ecfdf5; color: #047857; }
.badge.bad { background: #fef2f2; color: #b91c1c; }
.bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 11px;
}
.bar-label {
  width: 52px;
  color: #9ca3af;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar-track {
  flex: 1;
  height: 10px;
  background: #f3f4f6;
  border-radius: 5px;
  overflow: hidden;
}
.bar { height: 100%; border-radius: 5px; }
.bar.a { background: #93c5fd; }
.bar.b { background: #86efac; }
.bar-val { width: 48px; text-align: right; color: #374151; }

/* === 区块（工具/用例/runs） === */
.block {
  margin-top: 20px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 16px;
}
.block h3 { font-size: 13px; margin-bottom: 10px; }
.tool-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  font-size: 12px;
}
.tool-name {
  width: 180px;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tool-bars { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.tool-vals { width: 220px; color: #6b7280; white-space: nowrap; }

.cases { width: 100%; border-collapse: collapse; font-size: 13px; }
.cases th, .cases td {
  text-align: left;
  padding: 5px 8px;
  border-bottom: 1px solid #f3f4f6;
}
.cases th { font-size: 11px; color: #9ca3af; font-weight: 600; }
.cases .wall { color: #6b7280; font-size: 12px; }
.na { color: #d1d5db; }

/* === 最近 runs 双列 === */
.runs { display: flex; gap: 24px; }
.run-col { flex: 1; min-width: 0; }
.run {
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 6px;
  font-size: 12px;
}
.run summary {
  padding: 6px 10px;
  cursor: pointer;
  color: #374151;
}
.run[open] summary { border-bottom: 1px solid var(--border); }
</style>
