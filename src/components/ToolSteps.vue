<script setup lang="ts">
import type { ToolCall } from '../types/sse'

defineProps<{ toolCalls: ToolCall[] }>()

function inputSummary(input: Record<string, unknown>): string {
  const vals = Object.values(input)
  return vals.length ? String(vals[0]).slice(0, 60) : '(无参数)'
}
</script>

<template>
  <div class="tool-steps">
    <details v-for="tc in toolCalls" :key="tc.tool_use_id" class="tool-item" :class="tc.status">
      <summary>
        <span class="icon">
          <template v-if="tc.status === 'running'">⏳</template>
          <template v-else-if="tc.status === 'error'">❌</template>
          <template v-else>✅</template>
        </span>
        <code>{{ tc.name }}</code>
        <span class="args">{{ inputSummary(tc.input) }}</span>
        <span v-if="tc.duration_ms !== undefined" class="latency">{{ tc.duration_ms }}ms</span>
      </summary>
      <pre class="result">{{ tc.content ?? '执行中…' }}</pre>
    </details>
  </div>
</template>

<style scoped>
.tool-steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  max-width: 92%;
}
.tool-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #f8fafc;
  font-size: 13px;
  overflow: hidden;
}
.tool-item.error {
  border-color: #fecaca;
  background: #fef2f2;
}
summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  user-select: none;
  list-style: none;
}
.args {
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.latency {
  margin-left: auto;
  color: #9ca3af;
  font-size: 12px;
  flex-shrink: 0;
}
.result {
  padding: 8px 10px;
  border-top: 1px dashed var(--border);
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: #475569;
  max-height: 200px;
  overflow-y: auto;
}
</style>
