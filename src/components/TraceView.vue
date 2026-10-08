<script setup lang="ts">
/**
 * 运行轨迹面板（P7 可观测性）
 * ============================
 * 消费 done 事件 / 历史接口的扁平 trace 列表，按 iteration 分组
 * 渲染成两层树：轮 →（1 次 LLM 调用 + 0~N 次工具调用）。
 * 扁平结构不改、树在前端组 —— 后端保持"append-only 扁平事件"的简单。
 */
import { computed } from 'vue'
import type { GuardrailTrace, LlmCallTrace, RunTrace, SubagentTrace, ToolCallTrace, TraceEvent } from '../types/sse'

const props = defineProps<{ trace: RunTrace }>()

interface IterGroup {
  iteration: number
  llm?: LlmCallTrace
  tools: ToolCallTrace[]
}

/**
 * 扁平 trace → 两层树（轮 → 1 次 LLM + 0~N 次工具）。
 * subagent 条目不进 iteration 分组（它是整段子运行），由调用方单独渲染；
 * guardrail 条目（P7.7 L5）不依附任何轮次（run 开始时记的），也单独渲染；
 * 子智能体嵌套 trace 也走同一个函数 —— 一套分组逻辑复用两层。
 */
function groupTrace(events: TraceEvent[]): IterGroup[] {
  const map = new Map<number, IterGroup>()
  for (const ev of events) {
    if (ev.type === 'subagent' || ev.type === 'guardrail') continue
    let g = map.get(ev.iteration)
    if (!g) {
      g = { iteration: ev.iteration, tools: [] }
      map.set(ev.iteration, g)
    }
    if (ev.type === 'llm_call') g.llm = ev
    else g.tools.push(ev)
  }
  return [...map.values()].sort((a, b) => a.iteration - b.iteration)
}

const groups = computed<IterGroup[]>(() => groupTrace(props.trace.trace as TraceEvent[]))

const subagents = computed<SubagentTrace[]>(() =>
  (props.trace.trace as TraceEvent[]).filter(
    (ev): ev is SubagentTrace => ev.type === 'subagent',
  ),
)

/** 注入告警（P7.7 L5）：run 开始时命中护栏规则的记录 */
const guardrails = computed<GuardrailTrace[]>(() =>
  (props.trace.trace as TraceEvent[]).filter(
    (ev): ev is GuardrailTrace => ev.type === 'guardrail',
  ),
)

const totalTokens = computed(() => {
  const acc = { in: 0, out: 0 }
  for (const ev of props.trace.trace as TraceEvent[]) {
    if (ev.type === 'llm_call') {
      acc.in += ev.input_tokens
      acc.out += ev.output_tokens
    } else if (ev.type === 'subagent') {
      acc.in += ev.input_tokens   // 子智能体 tokens 已是本次运行的总量
      acc.out += ev.output_tokens
    }
  }
  return acc
})

const seconds = computed(() => (props.trace.wall_ms / 1000).toFixed(1))

/** stop_reason 人话翻译 */
function stopLabel(reason: string): string {
  const m: Record<string, string> = {
    end_turn: '结束', tool_use: '调工具', max_tokens: '截断', stop_sequence: '停止序列',
  }
  return m[reason] ?? reason
}

function resultPreview(result: string): string {
  return result.length > 200 ? result.slice(0, 200) + '…' : result
}
</script>

<template>
  <details class="trace-view">
    <summary>
      🔬 运行轨迹 · {{ groups.length }} 轮<template v-if="subagents.length">
      · {{ subagents.length }} 个子智能体</template> · {{ seconds }}s ·
      ↑{{ totalTokens.in }} ↓{{ totalTokens.out }} tokens
    </summary>
    <!-- 注入告警横幅（P7.7 L5）：不属于任何轮次，置顶渲染 -->
    <div v-for="(g, i) in guardrails" :key="`gw-${i}`" class="row guardrail" :class="{ high: g.risk === 'high' }">
      <span class="icon">{{ g.risk === 'high' ? '🛡️' : '⚠️' }}</span>
      <span>检测到疑似提示注入（{{ g.risk === 'high' ? '高危' : '低危' }}）：</span>
      <span class="rules">{{ g.rules.join('、') }}</span>
    </div>

    <div v-for="g in groups" :key="g.iteration" class="iter">
      <div class="iter-head">第 {{ g.iteration }} 轮</div>

      <div v-if="g.llm" class="row llm">
        <span class="icon">🧠</span>
        <code>{{ g.llm.model }}</code>
        <span class="meta">{{ stopLabel(g.llm.stop_reason) }} · {{ g.llm.wall_ms }}ms ·
          ↑{{ g.llm.input_tokens }} ↓{{ g.llm.output_tokens }}</span>
      </div>

      <details v-for="(t, i) in g.tools" :key="i" class="row tool" :class="{ dangerous: t.risk === 'high' }">
        <summary>
          <span class="icon">{{ t.risk === 'high' ? '⚡' : '🔧' }}</span>
          <code>{{ t.tool }}</code>
          <span class="meta">{{ t.latency_ms }}ms</span>
          <span v-if="t.risk === 'high'" class="risk-tag">危险操作</span>
        </summary>
        <pre class="detail">{{ resultPreview(t.result) }}</pre>
      </details>
    </div>

    <!-- 子智能体子运行（P7.6）：嵌套 details，内部复用同一套 iteration 分组 -->
    <details v-for="sub in subagents" :key="sub.id" class="iter subagent">
      <summary>
        <span class="icon">🤖</span>
        <code>{{ sub.name }}</code>
        <span class="meta">{{ sub.iterations }} 轮 ·
          {{ (sub.wall_ms / 1000).toFixed(1) }}s ·
          ↑{{ sub.input_tokens }} ↓{{ sub.output_tokens }}</span>
      </summary>
      <div class="sub-task">{{ sub.task }}</div>
      <div v-for="g in groupTrace(sub.trace)" :key="g.iteration" class="iter">
        <div class="iter-head">第 {{ g.iteration }} 轮</div>

        <div v-if="g.llm" class="row llm">
          <span class="icon">🧠</span>
          <code>{{ g.llm.model }}</code>
          <span class="meta">{{ stopLabel(g.llm.stop_reason) }} · {{ g.llm.wall_ms }}ms ·
            ↑{{ g.llm.input_tokens }} ↓{{ g.llm.output_tokens }}</span>
        </div>

        <details v-for="(t, i) in g.tools" :key="i" class="row tool">
          <summary>
            <span class="icon">🔧</span>
            <code>{{ t.tool }}</code>
            <span class="meta">{{ t.latency_ms }}ms</span>
          </summary>
          <pre class="detail">{{ resultPreview(t.result) }}</pre>
        </details>
      </div>
    </details>
  </details>
</template>

<style scoped>
.trace-view {
  margin-top: 8px;
  max-width: 92%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fafafa;
  font-size: 12px;
  overflow: hidden;
}
summary {
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  color: #6b7280;
  list-style: none;
}
summary:hover {
  color: #374151;
}
.iter {
  padding: 4px 10px 8px;
  border-top: 1px dashed var(--border);
}
.iter-head {
  font-weight: 600;
  color: #94a3b8;
  margin: 4px 0;
}
.subagent > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #475569;
}
.sub-task {
  font-size: 11px;
  color: #9ca3af;
  padding: 2px 10px 4px;
  white-space: pre-wrap;
  word-break: break-all;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0 3px 8px;
}
.row.tool {
  flex-direction: column;
  align-items: stretch;
  padding-left: 16px;
}
.row.tool > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.icon {
  flex-shrink: 0;
}
.meta {
  color: #9ca3af;
}
/* P7.7 L5：注入告警横幅 / 危险工具标记 */
.row.guardrail {
  padding: 4px 10px;
  font-size: 11px;
  color: #92400e;
  background: #fef3c7;
}
.row.guardrail.high {
  color: #991b1b;
  background: #fee2e2;
}
.row.guardrail .rules {
  font-weight: 600;
}
.risk-tag {
  font-size: 10px;
  color: #b91c1c;
  border: 1px solid #fca5a5;
  border-radius: 4px;
  padding: 0 4px;
}
.row.tool.dangerous > summary code {
  color: #b91c1c;
}
.detail {
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-all;
  color: #475569;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  margin: 2px 0 4px;
  max-height: 160px;
  overflow-y: auto;
}
</style>
