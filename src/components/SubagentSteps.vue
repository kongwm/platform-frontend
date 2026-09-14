<script setup lang="ts">
import type { SubagentCall } from '../types/sse'

defineProps<{ subagents: SubagentCall[] }>()

const LABELS: Record<string, string> = {
  researcher: '🔍 研究员',
  writer: '✍️ 撰写员',
}
</script>

<template>
  <div class="subagent-steps">
    <details v-for="sub in subagents" :key="sub.id" class="sub-item" :class="sub.status">
      <summary>
        <span class="badge">{{ sub.status === 'running' ? '⏳' : '✅' }}</span>
        <span class="sname">{{ LABELS[sub.name] ?? `🤖 ${sub.name}` }}</span>
        <span class="task">{{ (sub.task ?? '').slice(0, 40) }}</span>
      </summary>
      <div class="detail">
        <div class="label">任务：</div>
        <pre class="text">{{ sub.task }}</pre>
        <div class="label">交接摘要：</div>
        <pre class="text">{{ sub.summary ?? '执行中…' }}</pre>
      </div>
    </details>
  </div>
</template>

<style scoped>
.subagent-steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  max-width: 92%;
}
.sub-item {
  border: 1px solid #ddd6fe;
  border-radius: 8px;
  background: #f5f3ff;
  font-size: 13px;
  overflow: hidden;
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
.sname {
  font-weight: 600;
  color: #5b21b6;
  flex-shrink: 0;
}
.task {
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail {
  border-top: 1px dashed #ddd6fe;
  padding: 8px 10px;
}
.label {
  font-size: 11px;
  color: #9ca3af;
  margin: 4px 0 2px;
}
.text {
  font-size: 12px;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
  font-family: inherit;
}
</style>
