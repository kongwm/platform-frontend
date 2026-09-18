<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useChatStore } from '../stores/chat'
import { useConversationsStore } from '../stores/conversations'

const props = defineProps<{ view: 'chat' | 'kb' | 'memory' | 'mcp' | 'insights' }>()
const emit = defineEmits<{ (e: 'switch-view', v: 'chat' | 'kb' | 'memory' | 'mcp' | 'insights'): void }>()

const chat = useChatStore()
const convs = useConversationsStore()

/** 正在显示"移动到"菜单的会话 id（一次只开一个） */
const movingId = ref('')

onMounted(() => convs.refresh())

async function onRename(id: string, current: string) {
  const title = prompt('重命名会话', current)
  if (title && title.trim() && title !== current) await convs.rename(id, title.trim())
}

async function onDelete(id: string, title: string) {
  if (confirm(`删除会话「${title}」？消息将一并删除`)) {
    await chat.closeSession(id)   // 后台流也要先取消，避免 run 往已删会话写孤儿行
    await convs.remove(id)
  }
}

async function onNewProject() {
  const name = prompt('新项目名称')
  if (name && name.trim()) await convs.addProject(name.trim())
}

async function onDeleteProject(id: string, name: string) {
  if (confirm(`删除项目「${name}」？其中会话将移回默认分组`)) await convs.removeProject(id)
}

async function onMove(id: string, projectId: string | null) {
  movingId.value = ''
  await convs.move(id, projectId)
}

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>AI Agent 平台</h1>
      <button class="new-chat" @click="chat.newSession(); emit('switch-view', 'chat')">＋ 新对话</button>
    </div>

    <div class="sidebar-body">
      <div v-for="group in convs.grouped" :key="group.key" class="group">
        <div class="group-header">
          <span>{{ group.name }} ({{ group.items.length }})</span>
          <span class="group-actions">
            <!-- 项目分组：＋ = 在该项目下新建会话；✕ = 删除项目 -->
            <button
              v-if="group.project"
              title="在此项目下新建会话"
              @click.stop="chat.newSession(group.project!.id); emit('switch-view', 'chat')"
            >＋</button>
            <button
              v-if="group.project"
              title="删除项目"
              @click.stop="onDeleteProject(group.project!.id, group.project!.name)"
            >✕</button>
            <!-- 默认分组：＋ = 新建项目 -->
            <button v-else title="新建项目" @click.stop="onNewProject()">＋</button>
          </span>
        </div>

        <div
          v-for="c in group.items"
          :key="c.id"
          class="conv-item"
          :class="{ active: c.id === convs.activeId }"
          @click="chat.loadConversation(c.id); emit('switch-view', 'chat')"
        >
          <div class="conv-title">
            {{ c.title }}
            <span v-if="chat.sessionStreaming(c.id)" class="live-dot" title="正在生成（后台）"></span>
          </div>
          <div class="conv-meta">
            <span>↑{{ fmtTokens(c.input_tokens) }} ↓{{ fmtTokens(c.output_tokens) }}</span>
            <span class="conv-actions">
              <button title="重命名" @click.stop="onRename(c.id, c.title)">✎</button>
              <button title="移动到项目" @click.stop="movingId = movingId === c.id ? '' : c.id">📂</button>
              <button title="删除" @click.stop="onDelete(c.id, c.title)">🗑</button>
            </span>
          </div>

          <!-- 移动菜单：目标项目 + 默认分组，排除当前所在分组 -->
          <div v-if="movingId === c.id" class="move-menu" @click.stop>
            <div class="move-title">移动到：</div>
            <button
              v-for="p in convs.projects.filter((x) => x.id !== c.project_id)"
              :key="p.id"
              @click="onMove(c.id, p.id)"
            >📁 {{ p.name }}</button>
            <button v-if="c.project_id" @click="onMove(c.id, null)">📥 默认分组</button>
          </div>
        </div>
      </div>

      <div v-if="!convs.list.length" class="placeholder">还没有会话，发条消息开始吧</div>
    </div>

    <div class="sidebar-footer">
      <div class="view-switch">
        <button :class="{ on: props.view === 'kb' }" @click="emit('switch-view', 'kb')">📚 知识库</button>
        <button :class="{ on: props.view === 'memory' }" @click="emit('switch-view', 'memory')">🧠 记忆</button>
        <button :class="{ on: props.view === 'mcp' }" @click="emit('switch-view', 'mcp')">🔌 MCP</button>
        <button :class="{ on: props.view === 'insights' }" @click="emit('switch-view', 'insights')">📊 评测</button>
        <button :class="{ on: props.view === 'chat' }" @click="emit('switch-view', 'chat')">💬 对话</button>
      </div>
      <span v-if="props.view === 'chat' && chat.sessionId">当前会话: {{ chat.sessionId }}</span>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: #fff;
  display: flex;
  flex-direction: column;
}
.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border);
}
h1 {
  font-size: 16px;
  margin-bottom: 12px;
}
.new-chat {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}
.new-chat:hover {
  background: var(--bg);
}
.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.group {
  margin-bottom: 12px;
}
.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  font-size: 12px;
  color: #6b7280;
  font-weight: 600;
}
.group-actions button,
.conv-actions button,
.move-menu button {
  border: none;
  background: none;
  cursor: pointer;
  color: #9ca3af;
  font-size: 12px;
  padding: 2px 4px;
}
.group-actions button:hover,
.conv-actions button:hover,
.move-menu button:hover {
  color: #374151;
}
.conv-item {
  position: relative;   /* 移动菜单以此为定位锚 */
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 2px;
}
.conv-item:hover {
  background: var(--bg);
}
.conv-item.active {
  background: #eef2ff;
}
.conv-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 后台生成中的呼吸灯：并行流状态对用户可见（否则"切走了还在跑"像丢了） */
.live-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-left: 4px;
  border-radius: 50%;
  background: #22c55e;
  animation: live-pulse 1.2s ease-in-out infinite;
}
@keyframes live-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}
.conv-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 2px;
  font-size: 11px;
  color: #9ca3af;
}
.conv-actions {
  visibility: hidden;
}
.conv-item:hover .conv-actions {
  visibility: visible;
}
.move-menu {
  position: absolute;
  top: 100%;
  right: 8px;
  z-index: 10;
  min-width: 150px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  padding: 4px;
  display: flex;
  flex-direction: column;
}
.move-title {
  font-size: 11px;
  color: #9ca3af;
  padding: 2px 6px;
}
.move-menu button {
  text-align: left;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
}
.move-menu button:hover {
  background: var(--bg);
}
.placeholder {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  margin-top: 40px;
}
.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: #9ca3af;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.view-switch {
  display: flex;
  gap: 6px;
}
.view-switch button {
  flex: 1;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  color: #6b7280;
}
.view-switch button.on {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #4338ca;
}
</style>
