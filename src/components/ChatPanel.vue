<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import { useChatStore } from '../stores/chat'
import MessageList from './MessageList.vue'

const chat = useChatStore()
const input = ref('')
const listEl = ref<HTMLElement>()
const ta = ref<HTMLTextAreaElement>()

// 中文输入法组词中：按 Enter 是确认候选词，不是发送
const composing = ref(false)

async function send() {
  if (composing.value) return
  const text = input.value.trim()
  if (!text || chat.isStreaming) return
  input.value = ''
  await chat.sendMessage(text)
}

// 自适应行数：2 行起步，动态长高，最多 5 行（超出后内部滚动）
const BASE_ROWS = 2
const MAX_ROWS = 5

function resize() {
  const el = ta.value
  if (!el) return
  const cs = getComputedStyle(el)
  const line = parseFloat(cs.lineHeight) || 21
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
  const borders = el.offsetHeight - el.clientHeight   // 上下边框
  const min = line * BASE_ROWS + pad + borders
  const max = line * MAX_ROWS + pad + borders
  el.style.height = 'auto'                            // 先归零拿真实内容高度
  const h = Math.min(Math.max(el.scrollHeight, min), max)
  el.style.height = `${h}px`
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
}

watch(input, () => nextTick(resize))
onMounted(resize)

/** 流式输出时自动滚动到底部（用户手动上滚时会脱离，靠scrollTop判断） */
watch(
  () => [chat.messages, chat.isStreaming],
  async () => {
    const el = listEl.value
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) await nextTick(() => el.scrollTo({ top: el.scrollHeight }))
  },
  { deep: true },
)
</script>

<template>
  <main class="chat-panel">
    <div ref="listEl" class="messages-wrap">
      <MessageList />
    </div>

    <div v-if="chat.lastError" class="error-bar">⚠️ {{ chat.lastError }}</div>

    <div class="input-area">
      <div class="input-row">
        <textarea
          ref="ta"
          v-model="input"
          :placeholder="chat.pendingAsk ? `回答 Agent 的问题：${chat.pendingAsk.question.slice(0, 30)}…` : '问点什么…（Shift+Enter 换行）'"
          rows="2"
          @compositionstart="composing = true"
          @compositionend="composing = false"
          @keydown.enter.exact.prevent="send()"
        ></textarea>
        <!-- 生成中把发送换成停止：协作式取消（部分回答保留），不是硬断 -->
        <button v-if="chat.isStreaming" class="stop" @click="chat.stop()">■ 停止</button>
        <button v-else class="send" :disabled="!input.trim()" @click="send">发送</button>
      </div>
      <div v-if="chat.lastUsage" class="usage">
        tokens: ↑{{ chat.lastUsage.input_tokens }} ↓{{ chat.lastUsage.output_tokens }}
      </div>
    </div>
  </main>
</template>

<style scoped>
.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.messages-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 24px 16px;
}
.error-bar {
  margin: 0 16px 8px;
  padding: 8px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  border-radius: 8px;
  font-size: 13px;
}
.input-area {
  border-top: 1px solid var(--border);
  background: #fff;
  padding: 12px 16px;
}
.input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
textarea {
  flex: 1;
  resize: none;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  line-height: 1.5;   /* resize() 按它算行高，勿删 */
  font-family: inherit;
  overflow-y: hidden; /* 由 resize() 切换 auto/hidden，避免出现静止滚动条 */
  outline: none;
}
textarea:focus {
  border-color: #93c5fd;
}
.send {
  padding: 10px 18px;
  border: none;
  border-radius: 10px;
  background: var(--user-bubble);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
.send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.stop {
  padding: 10px 18px;
  border: 1px solid #fca5a5;
  border-radius: 10px;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}
.stop:hover {
  background: #fee2e2;
}
.usage {
  margin-top: 6px;
  font-size: 12px;
  color: #9ca3af;
  text-align: right;
}
</style>
