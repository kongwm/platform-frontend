<script setup lang="ts">
import { useChatStore } from '../stores/chat'
import MessageItem from './MessageItem.vue'

const chat = useChatStore()
</script>

<template>
  <div class="message-list">
    <div v-if="!chat.messages.length" class="empty">
      <h2>👋 开始对话</h2>
      <p>Agent 可以调用工具（时间 / 计算 / 搜索），过程实时展示</p>
      <ul>
        <li>「现在几点了？123*456 等于多少？」</li>
        <li>「北京和上海今天哪个更适合跑步？」</li>
      </ul>
    </div>
    <MessageItem v-for="msg in chat.messages" :key="msg.id" :message="msg" />
  </div>
</template>

<style scoped>
.message-list {
  max-width: 780px;
  margin: 0 auto;
}
.empty {
  text-align: center;
  color: #6b7280;
  margin-top: 80px;
}
.empty h2 {
  font-size: 20px;
  margin-bottom: 8px;
}
.empty ul {
  list-style: none;
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
  color: #9ca3af;
}
.empty li {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 14px;
}
</style>
