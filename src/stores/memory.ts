/**
 * 长期记忆 store —— 记忆面板的数据与操作
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  addMemory,
  deleteMemory,
  fetchMemories,
  searchMemories,
  updateMemory,
  type MemoryItem,
  type MemorySearchResult,
} from '../api/memory'

export const useMemoryStore = defineStore('memory', () => {
  const items = ref<MemoryItem[]>([])
  const loading = ref(false)
  const message = ref('')   // 操作反馈（成功/失败提示）

  // === 语义搜索（调试端点：人眼验证检索质量） ===
  const searchResults = ref<MemorySearchResult[] | null>(null)
  const searching = ref(false)

  async function refresh() {
    loading.value = true
    try {
      items.value = await fetchMemories()
    } catch (e) {
      message.value = `❌ ${e instanceof Error ? e.message : String(e)}`
    } finally {
      loading.value = false
    }
  }

  async function add(content: string, type: 'fact' | 'preference') {
    message.value = ''
    try {
      await addMemory(content, type)
      message.value = '✅ 已添加'
      await refresh()
    } catch (e) {
      message.value = `❌ ${e instanceof Error ? e.message : String(e)}`
    }
  }

  async function edit(id: string, content: string) {
    try {
      await updateMemory(id, content)
      message.value = '✅ 已更新（向量已同步重建）'
      await refresh()
    } catch (e) {
      message.value = `❌ ${e instanceof Error ? e.message : String(e)}`
    }
  }

  async function remove(id: string, content: string) {
    if (!confirm(`删除记忆「${content}」？`)) return
    await deleteMemory(id)
    message.value = '🗑 已删除'
    await refresh()
  }

  async function testSearch(q: string) {
    if (!q.trim()) return
    searching.value = true
    try {
      searchResults.value = await searchMemories(q)
    } catch (e) {
      message.value = `❌ ${e instanceof Error ? e.message : String(e)}`
    } finally {
      searching.value = false
    }
  }

  return {
    items, loading, message, searchResults, searching,
    refresh, add, edit, remove, testSearch,
  }
})
