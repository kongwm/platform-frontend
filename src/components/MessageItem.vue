<script setup lang="ts">
import type { UiMessage } from '../types/sse'
import MarkdownView from './MarkdownView.vue'
import SubagentSteps from './SubagentSteps.vue'
import ToolSteps from './ToolSteps.vue'
import TraceView from './TraceView.vue'

const props = defineProps<{ message: UiMessage }>()
const apiBase = 'http://localhost:8000'
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
