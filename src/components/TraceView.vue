<script setup lang="ts">
/**
 * 运行轨迹面板（P7 可观测性）
 * ============================
 * 消费 done 事件 / 历史接口的扁平 trace 列表，按 iteration 分组
 * 渲染成两层树：轮 →（1 次 LLM 调用 + 0~N 次工具调用）。
 * 扁平结构不改、树在前端组 —— 后端保持"append-only 扁平事件"的简单。
 */
import { computed } from 'vue'
import type { LlmCallTrace, RunTrace, ToolCallTrace, TraceEvent } from '../types/sse'

const props = defineProps<{ trace: RunTrace }>()

interface IterGroup {
  iteration: number
  llm?: LlmCallTrace
  tools: ToolCallTrace[]
}

const groups = computed<IterGroup[]>(() => {
  const map = new Map<number, IterGroup>()
  for (const ev of props.trace.trace as TraceEvent[]) {
    let g = map.get(ev.iteration)
    if (!g) {
      g = { iteration: ev.iteration, tools: [] }
      map.set(ev.iteration, g)
    }
    if (ev.type === 'llm_call') g.llm = ev
    else g.tools.push(ev)
  }
  return [...map.values()].sort((a, b) => a.iteration - b.iteration)
})

const totalTokens = computed(() =>
  groups.value.reduce(
    (acc, g) =>
      g.llm
        ? { in: acc.in + g.llm.input_tokens, out: acc.out + g.llm.output_tokens }
        : acc,
    { in: 0, out: 0 },
  ),
)

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
      🔬 运行轨迹 · {{ groups.length }} 轮 · {{ seconds }}s ·
      ↑{{ totalTokens.in }} ↓{{ totalTokens.out }} tokens
    </summary>
    <div v-for="g in groups" :key="g.iteration" class="iter">
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
