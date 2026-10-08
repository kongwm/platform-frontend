<script setup lang="ts">
import type { UiMessage } from '../types/sse'
import MarkdownView from './MarkdownView.vue'
import SubagentSteps from './SubagentSteps.vue'
import ToolSteps from './ToolSteps.vue'
import TraceView from './TraceView.vue'
import { useChatStore } from '../stores/chat'

const props = defineProps<{ message: UiMessage }>()
const apiBase = 'http://localhost:8000'
const chat = useChatStore()

/** 审批入参摘要：挑人能读懂的字段（title/content/keyword…），其余 JSON 化 */
function approvalSummary(input: Record<string, unknown>): string {
  const known = ['title', 'content', 'keyword', 'name', 'text', 'query']
  const parts: string[] = []
  for (const k of known) {
    if (input[k]) parts.push(`${k}: ${String(input[k]).slice(0, 80)}`)
  }
  if (!parts.length) parts.push(JSON.stringify(input).slice(0, 120))
  return parts.join(' · ')
}
</script>

<template>
  <div class="message" :class="message.role">
    <!-- 子智能体派发（P5）：展示在工具步骤上方（它就是一次 delegate_task） -->
    <SubagentSteps v-if="message.subagents?.length" :subagents="message.subagents" />

    <!-- 工具调用步骤展示在正文上方（时序上工具先于最终回答） -->
    <ToolSteps v-if="message.toolCalls.length" :tool-calls="message.toolCalls" />

    <div v-if="message.role === 'user'" class="bubble">{{ message.content }}</div>
    <MarkdownView v-else-if="message.content" :content="message.content" />

    <!-- HITL 提问卡片（P7.5）：实时 ask_user 事件与历史回放共用此渲染 -->
    <div v-if="message.askUser" class="ask-card">
      <div class="ask-title">🙋 Agent 需要你的输入</div>
      <div class="ask-question">{{ message.askUser.question }}</div>
      <ul v-if="message.askUser.fields.length" class="ask-fields">
        <li v-for="f in message.askUser.fields" :key="f.name">
          {{ f.label }}<span v-if="f.required !== false" class="req">（必填）</span>
        </li>
      </ul>
      <div class="ask-hint">请在下方输入框直接回答</div>
    </div>

    <!-- 危险操作审批卡片（P7.7 L3）：实时事件可交互，历史回放只读 -->
    <div v-if="message.approval" class="approval-card">
      <div class="approval-title">🛡️ 危险操作需要你的确认</div>
      <div class="approval-tool">
        Agent 请求执行 <code>{{ message.approval.tool }}</code>
      </div>
      <div class="approval-input">{{ approvalSummary(message.approval.input) }}</div>
      <template v-if="!message.approval.resolved">
        <div class="approval-actions">
          <button class="btn approve" :disabled="chat.isStreaming" @click="chat.respondApproval(true)">
            确认执行
          </button>
          <button class="btn decline" :disabled="chat.isStreaming" @click="chat.respondApproval(false)">
            取消
          </button>
        </div>
        <div class="approval-hint">该操作会写入外部系统，确认前不会执行</div>
      </template>
      <div v-else class="approval-hint">已处理（历史记录）</div>
    </div>

    <!-- 运行轨迹（P7）：实时 done 带回 / 历史接口回放，正文之下、附件之上 -->
    <TraceView v-if="message.trace" :trace="message.trace" />

    <!-- 产出物（PDF/图表）：可下载附件卡片 -->
    <div v-if="message.artifacts?.length" class="artifacts">
      <a
        v-for="art in message.artifacts"
        :key="art.id"
        :href="`${apiBase}${art.url}`"
        download
        class="artifact-card"
      >
        <span class="icon">{{ art.type === 'pdf' ? '📄' : '🖼' }}</span>
        <span class="info">
          <span class="fname">{{ art.filename }}</span>
          <span class="ftype">{{ art.type === 'pdf' ? 'PDF 文档' : '图表图片' }} · 点击下载</span>
        </span>
      </a>
    </div>
  </div>
</template>

<style scoped>
.message {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
}
.message.user {
  align-items: flex-end;
}
.bubble {
  background: var(--user-bubble);
  color: var(--user-text);
  padding: 10px 14px;
  border-radius: 14px 14px 4px 14px;
  max-width: 78%;
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.6;
}

/* === HITL 提问卡片 === */
.ask-card {
  max-width: 78%;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
}
.ask-title {
  font-weight: 600;
  color: #92400e;
  margin-bottom: 4px;
}
.ask-question {
  color: #1f2937;
  line-height: 1.5;
  white-space: pre-wrap;
}
.ask-fields {
  margin: 6px 0 0;
  padding-left: 18px;
  color: #6b7280;
}
.req {
  color: #b91c1c;
  font-size: 12px;
}
.ask-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #9ca3af;
}

/* === 危险操作审批卡片（P7.7 L3）=== */
.approval-card {
  max-width: 78%;
  border: 1px solid #fca5a5;
  background: #fef2f2;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
}
.approval-title {
  font-weight: 600;
  color: #991b1b;
  margin-bottom: 4px;
}
.approval-tool code {
  background: #fee2e2;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 12px;
}
.approval-input {
  margin-top: 6px;
  color: #6b7280;
  font-size: 12px;
  word-break: break-all;
}
.approval-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.approval-actions .btn {
  border-radius: 6px;
  border: 1px solid;
  padding: 4px 14px;
  font-size: 13px;
  cursor: pointer;
}
.btn.approve {
  background: #dc2626;
  border-color: #dc2626;
  color: #fff;
}
.btn.approve:disabled {
  background: #fca5a5;
  border-color: #fca5a5;
  cursor: not-allowed;
}
.btn.decline {
  background: #fff;
  border-color: #d1d5db;
  color: #374151;
}
.btn.decline:disabled {
  color: #d1d5db;
  cursor: not-allowed;
}
.approval-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #9ca3af;
}

/* === 产出物附件卡片 === */
.artifacts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 60%;
}
.artifact-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s;
}
.artifact-card:hover {
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.15);
}
.icon {
  font-size: 22px;
}
.info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.fname {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ftype {
  font-size: 11px;
  color: #6b7280;
}
</style>
