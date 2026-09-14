/**
 * 知识库 store —— 管理页的数据与操作
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  deleteDoc,
  fetchDocs,
  reindexDoc,
  searchTest,
  uploadDoc,
  type KbDoc,
  type SearchResult,
} from '../api/kb'

export const useKbStore = defineStore('kb', () => {
  const docs = ref<KbDoc[]>([])
  const uploading = ref(false)
  const message = ref('')   // 操作反馈（成功/失败提示）

  async function refresh() {
    try {
      docs.value = await fetchDocs()
    } catch (e) {
      message.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function upload(file: File) {
    uploading.value = true
    message.value = ''
    try {
      const doc = await uploadDoc(file)
      message.value = `✅ ${doc.filename} 入库成功（${doc.chunk_count} 块）`
      await refresh()
    } catch (e) {
      message.value = `❌ ${e instanceof Error ? e.message : String(e)}`
    } finally {
      uploading.value = false
    }
  }

  async function remove(id: string, filename: string) {
    if (!confirm(`删除文档「${filename}」及其全部向量？`)) return
    await deleteDoc(id)
    await refresh()
  }

  async function reindex(id: string, filename: string) {
    message.value = `⏳ 重建 ${filename} 的向量…`
    try {
      const r = await reindexDoc(id)
      message.value = `✅ ${filename} 重建完成（${r.chunk_count} 块）`
      await refresh()
    } catch (e) {
      message.value = `❌ ${e instanceof Error ? e.message : String(e)}`
    }
  }

  // === 调试搜索（人眼验证检索质量，调 RAG 的第一步） ===
  const searchResults = ref<SearchResult[] | null>(null)
  const searching = ref(false)

  async function testSearch(q: string) {
    if (!q.trim()) return
    searching.value = true
    try {
      searchResults.value = await searchTest(q)
    } catch (e) {
      message.value = `❌ ${e instanceof Error ? e.message : String(e)}`
    } finally {
      searching.value = false
    }
  }

  return {
    docs, uploading, message, searchResults, searching,
    refresh, upload, remove, reindex, testSearch,
  }
})
