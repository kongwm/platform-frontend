<script setup lang="ts">
import { ref } from 'vue'
import SidebarShell from './components/SidebarShell.vue'
import ChatPanel from './components/ChatPanel.vue'
import InsightsPanel from './components/InsightsPanel.vue'
import KnowledgeBase from './components/KnowledgeBase.vue'
import McpPanel from './components/McpPanel.vue'
import MemoryPanel from './components/MemoryPanel.vue'

/**
 * 视图切换（不引 vue-router —— 学习项目用 ref 切换足够）：
 *   chat = 对话（默认）  kb = 知识库管理  memory = 长期记忆
 *   mcp = MCP 外部工具  insights = 评测对比
 */
const view = ref<'chat' | 'kb' | 'memory' | 'mcp' | 'insights'>('chat')
</script>

<template>
  <div class="app-layout">
    <SidebarShell :view="view" @switch-view="view = $event" />
    <ChatPanel v-if="view === 'chat'" />
    <KnowledgeBase v-else-if="view === 'kb'" />
    <MemoryPanel v-else-if="view === 'memory'" />
    <McpPanel v-else-if="view === 'mcp'" />
    <InsightsPanel v-else />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
}
</style>
