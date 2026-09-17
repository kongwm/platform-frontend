<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useMemoryStore } from '../stores/memory'

const mem = useMemoryStore()
const query = ref('')

// === 手动添加 ===
const newContent = ref('')
const newType = ref<'fact' | 'preference'>('fact')

async function onAdd() {
  if (!newContent.value.trim()) return
  await mem.add(newContent.value.trim(), newType.value)
  newContent.value = ''
}

// === 行内编辑 ===
const editingId = ref<string | null>(null)
const editingContent = ref('')

function startEdit(id: string, content: string) {
  editingId.value = id
  editingContent.value = content
}

async function saveEdit(id: string) {
  if (!editingContent.value.trim()) return
  await mem.edit(id, editingContent.value.trim())
  editingId.value = null
}

function cancelEdit() {
  editingId.value = null
}

async function onSearch() {
  await mem.testSearch(query.value)
}

onMounted(() => mem.refresh())
</script>

<template>
  <main class="mem-panel">
    <div class="mem-inner">
      <h2>🧠 长期记忆</h2>
      <p class="hint">
        跨会话的用户记忆：会话结束后自动提取 + Agent 用 write_memory 主动记录。
        新会话开始时按提问语义检索 top-k 注入 system prompt —— Agent 因此"记得你是谁"。
      </p>

      <!-- 手动添加区 -->
      <div class="add-row">
        <input
          v-model="newContent"
          placeholder="手动添加一条记忆，如：用户偏好简洁的中文回复"
          @keydown.enter="onAdd()"
        />
        <select v-model="newType">
          <option value="fact">fact 事实</option>
          <option value="preference">preference 偏好</option>
        </select>
        <button :disabled="!newContent.trim()" @click="onAdd">＋ 添加</button>
        <span v-if="mem.message" class="msg">{{ mem.message }}</span>
      </div>

      <!-- 记忆列表 -->
      <table class="mem-table">
        <thead>
          <tr><th>内容</th><th>类型</th><th>来源</th><th>更新时间</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="m in mem.items" :key="m.id">
            <td class="content">
              <template v-if="editingId === m.id">
                <div class="edit-box">
                  <textarea v-model="editingContent" rows="2" />
                  <div class="edit-ops">
                    <button class="save" @click="saveEdit(m.id)">保存</button>
                    <button @click="cancelEdit">取消</button>
                  </div>
                </div>
              </template>
              <template v-else>
                <span class="content-text" :title="m.content" @dblclick="startEdit(m.id, m.content)">
                  {{ m.content }}
                </span>
              </template>
            </td>
            <td>
              <span class="badge" :class="m.type">{{ m.type }}</span>
            </td>
            <td>
              <span class="badge src" :class="m.source">
                {{ m.source === 'auto' ? '自动提取' : m.source === 'tool' ? 'Agent 写入' : '手动' }}
              </span>
            </td>
            <td class="time">{{ m.updated_at.slice(5, 16) }}</td>
            <td class="ops">
              <button title="编辑（双击内容也可以）" @click="startEdit(m.id, m.content)">✏️</button>
              <button title="删除" @click="mem.remove(m.id, m.content)">🗑</button>
            </td>
          </tr>
          <tr v-if="!mem.items.length && !mem.loading">
            <td colspan="5" class="empty">
              还没有记忆。去对话里做个自我介绍（"我叫…，以后…"），流结束后会自动提取。
            </td>
          </tr>
        </tbody>
      </table>

      <!-- 语义搜索：人眼验证检索质量 -->
      <div class="debug-search">
        <h3>🔍 检索调试（新会话注入的就是这些结果）</h3>
        <div class="search-row">
          <input
            v-model="query"
            placeholder="模拟一句用户提问，如：我平时喜欢用什么语言？"
            @keydown.enter="onSearch()"
          />
          <button :disabled="mem.searching || !query.trim()" @click="onSearch">
            {{ mem.searching ? '查询中…' : '检索' }}
          </button>
        </div>

        <div v-if="mem.searchResults && !mem.searchResults.length" class="no-result">
          无结果 —— 记忆里没有相关内容，新会话里 Agent 也不会看到
        </div>
        <div v-for="(r, i) in mem.searchResults" :key="i" class="hit">
          <div class="hit-src">
            [{{ i + 1 }}] [{{ r.type }}] {{ r.content }}
            <span class="score">相关度 {{ (r.score * 100).toFixed(0) }}%</span>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.mem-panel {
  flex: 1;
  overflow-y: auto;
  padding: 24px 16px;
}
.mem-inner {
  max-width: 820px;
  margin: 0 auto;
}
h2 {
  font-size: 18px;
  margin-bottom: 6px;
}
.hint {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 16px;
  line-height: 1.6;
}
.add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.add-row input {
  flex: 1;
  min-width: 240px;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  outline: none;
}
.add-row input:focus {
  border-color: #93c5fd;
}
.add-row select {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  font-size: 13px;
  background: #fff;
}
.add-row button {
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
}
.add-row button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.msg {
  font-size: 13px;
}
.mem-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  background: #fff;
}
.mem-table th,
.mem-table td {
  border: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.mem-table th {
  background: var(--bg);
  font-weight: 600;
  color: #6b7280;
}
.content {
  max-width: 380px;
}
.content-text {
  white-space: pre-wrap;
  word-break: break-all;
  cursor: text;   /* 提示可双击编辑 */
}
.edit-box textarea {
  width: 100%;
  border: 1px solid #93c5fd;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}
.edit-ops {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}
.edit-ops button {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #fff;
  padding: 3px 12px;
  cursor: pointer;
  font-size: 12px;
}
.edit-ops button.save {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  white-space: nowrap;
}
.badge.fact {
  background: #eff6ff;
  color: #1d4ed8;
}
.badge.preference {
  background: #fef3c7;
  color: #b45309;
}
.badge.src.auto {
  background: #f0fdf4;
  color: #15803d;
}
.badge.src.tool {
  background: #f5f3ff;
  color: #6d28d9;
}
.badge.src.manual {
  background: var(--bg);
  color: #6b7280;
}
.time {
  color: #9ca3af;
  white-space: nowrap;
}
.ops button {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
}
.empty {
  text-align: center;
  color: #9ca3af;
  padding: 24px;
}
.debug-search {
  margin-top: 28px;
  border-top: 1px solid var(--border);
  padding-top: 16px;
}
h3 {
  font-size: 15px;
  margin-bottom: 10px;
}
.search-row {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}
.search-row input {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  outline: none;
}
.search-row input:focus {
  border-color: #93c5fd;
}
.search-row button {
  padding: 8px 18px;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
}
.no-result {
  color: #9ca3af;
  font-size: 13px;
  padding: 12px;
  background: var(--bg);
  border-radius: 8px;
}
.hit {
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 10px;
  background: #fff;
  overflow: hidden;
}
.hit-src {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  background: var(--bg);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.score {
  color: #059669;
  font-weight: 400;
  white-space: nowrap;
}
</style>
