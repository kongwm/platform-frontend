/**
 * MCP store —— 面板数据与重连操作
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchMcpStatus, reloadMcp, type McpStatus } from '../api/mcp'

export const useMcpStore = defineStore('mcp', () => {
  const status = ref<McpStatus | null>(null)
  const reloading = ref(false)
  const message = ref('')

  async function refresh() {
    try {
      status.value = await fetchMcpStatus()
    } catch (e) {
      message.value = e instanceof Error ? e.message : String(e)
    }
  }

  async function reload() {
    reloading.value = true
    message.value = '⏳ 断开并重连全部 server…'
    try {
      status.value = await reloadMcp()
      const running = status.value.servers.filter((s) => s.status === 'running').length
      message.value = `✅ 重连完成：${running}/${status.value.servers.length} 个 server 在线`
    } catch (e) {
      message.value = `❌ ${e instanceof Error ? e.message : String(e)}`
    } finally {
      reloading.value = false
    }
  }

  return { status, reloading, message, refresh, reload }
})
