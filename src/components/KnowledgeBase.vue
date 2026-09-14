<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useKbStore } from '../stores/kb'

const kb = useKbStore()
const fileInput = ref<HTMLInputElement>()
const query = ref('')

onMounted(() => kb.refresh())

async function onFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files?.length) {
    await kb.upload(files[0])
    ;(e.target as HTMLInputElement).value = ''   // 允许重复上传同名文件
  }
}

async function onSearch() {
  await kb.testSearch(query.value)
}
</script>

<template>
  <main class="kb-panel">
    <div class="kb-inner">
      <h2>📚 知识库</h2>
      <p class="hint">
        上传内部文档（md / txt / pdf / docx），Agent 会通过 search_knowledge_base
        工具自主检索。块 = 检索的最小单位，"来源"列可验证引用溯源。
      </p>

      <!-- 上传区 -->
      <div class="upload-row">
        <input ref="fileInput" type="file" accept=".md,.markdown,.txt,.pdf,.docx" hidden @change="onFileChange" />
        <button class="upload-btn" :disabled="kb.uploading" @click="fileInput?.click()">
          {{ kb.uploading ? '⏳ 入库中…（分块 + 嵌入）' : '＋ 上传文档' }}
        </button>
        <span v-if="kb.message" class="msg">{{ kb.message }}</span>
      </div>

      <!-- 文档列表 -->
      <table class="doc-table">
        <thead>
          <tr><th>文件名</th><th>状态</th><th>块数</th><th>上传时间</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="d in kb.docs" :key="d.id">
            <td class="filename" :title="d.error ?? d.filename">{{ d.filename }}</td>
            <td>
              <span v-if="d.status === 'done'" class="ok">✅ done</span>
              <span v-else-if="d.status === 'error'" class="err" :title="d.error ?? undefined">❌ error</span>
              <span v-else>⏳ pending</span>
            </td>
            <td>{{ d.chunk_count }}</td>
            <td class="time">{{ d.created_at.slice(5, 16) }}</td>
            <td class="ops">
              <button title="重建向量（换 embedding 模型后用）" @click="kb.reindex(d.id, d.filename)">🔄</button>
              <button title="删除" @click="kb.remove(d.id, d.filename)">🗑</button>
            </td>
          </tr>
          <tr v-if="!kb.docs.length">
            <td colspan="5" class="empty">还没有文档。可以先去 AIDemo/knowledge_base/ 找几个 md 试试。</td>
          </tr>
        </tbody>
      </table>

      <!-- 调试搜索：人眼验证检索质量（调 RAG 的第一步） -->
      <div class="debug-search">
        <h3>🔍 检索调试（绕过 Agent 直查）</h3>
        <div class="search-row">
          <input
            v-model="query"
            placeholder="输入关键词，如：差旅报销期限"
            @keydown.enter="onSearch()"
          />
          <button :disabled="kb.searching || !query.trim()" @click="onSearch">
            {{ kb.searching ? '查询中…' : '检索' }}
          </button>
        </div>

        <div v-if="kb.searchResults && !kb.searchResults.length" class="no-result">
          无结果 —— 换个词试试，或检查文档是否入库成功
        </div>
        <div v-for="(r, i) in kb.searchResults" :key="i" class="hit">
          <div class="hit-src">
            [{{ i + 1 }}] 《{{ r.filename }}》 {{ r.heading }}
            <span class="score">相关度 {{ (r.score * 100).toFixed(0) }}%</span>
          </div>
          <pre class="hit-text">{{ r.text }}</pre>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.kb-panel {
  flex: 1;
  overflow-y: auto;
  padding: 24px 16px;
}
.kb-inner {
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
.upload-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.upload-btn {
  padding: 8px 18px;
  border: 1px dashed #93c5fd;
  border-radius: 8px;
  background: #eff6ff;
  color: #1d4ed8;
  cursor: pointer;
  font-size: 14px;
}
.upload-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.msg {
  font-size: 13px;
}
.doc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  background: #fff;
}
.doc-table th,
.doc-table td {
  border: 1px solid var(--border);
  padding: 8px 10px;
  text-align: left;
}
.doc-table th {
  background: var(--bg);
  font-weight: 600;
  color: #6b7280;
}
.filename {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time {
  color: #9ca3af;
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
}
.score {
  color: #059669;
  font-weight: 400;
}
.hit-text {
  padding: 10px 12px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  color: #475569;
  max-height: 180px;
  overflow-y: auto;
  font-family: inherit;
}
</style>
