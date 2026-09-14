<script setup lang="ts">
import { onMounted } from 'vue'
import { useMcpStore } from '../stores/mcp'

const mcp = useMcpStore()

onMounted(() => mcp.refresh())
</script>

<template>
  <main class="mcp-panel">
    <div class="mcp-inner">
      <h2>🔌 MCP 外部工具</h2>
      <p class="hint">
        后端作为 MCP Client 连接外部 server，工具<b>动态发现</b>并注册给 Agent
        （命名 <code>mcp__server__工具名</code>）。server 挂了点"重连"即可热恢复，
        不用重启后端。
      </p>

      <div class="ops-row">
        <button class="reload-btn" :disabled="mcp.reloading" @click="mcp.reload()">
          {{ mcp.reloading ? '⏳ 重连中…' : '🔄 重连全部 server' }}
        </button>
        <span v-if="mcp.message" class="msg">{{ mcp.message }}</span>
      </div>

      <div v-if="mcp.status && !mcp.status.enabled" class="disabled-tip">
        MCP_ENABLED=0，MCP 未启用。设为 1 重启后端开启。
      </div>

      <div v-for="srv in mcp.status?.servers ?? []" :key="srv.name" class="srv-card" :class="srv.status">
        <div class="srv-head">
          <span class="dot">{{ srv.status === 'running' ? '🟢' : srv.status === 'error' ? '🔴' : '⚪' }}</span>
          <span class="sname">{{ srv.name }}</span>
          <span class="badge" v-if="srv.optional">可选</span>
          <span class="status-text">{{ srv.status }}</span>
        </div>
        <div class="cmd" :title="srv.command">$ {{ srv.command }}</div>
        <div class="tools">
          <div v-for="t in srv.tools" :key="t.name" class="tool-row">
            <code>{{ t.agent_name }}</code>
          </div>
          <div v-if="srv.status === 'running' && !srv.tools.length" class="empty-tools">
            （无工具 —— 可能被白名单过滤）
          </div>
        </div>
      </div>

      <div v-if="!mcp.status?.servers.length" class="empty">没有已配置的 server</div>
    </div>
  </main>
</template>

<style scoped>
.mcp-panel {
  flex: 1;
  overflow-y: auto;
  padding: 24px 16px;
}
.mcp-inner {
  max-width: 760px;
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
  line-height: 1.7;
}
.ops-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.reload-btn {
  padding: 8px 18px;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  background: #fffbeb;
  color: #92400e;
  cursor: pointer;
  font-size: 14px;
}
.reload-btn:disabled {
  opacity: 0.6;
}
.msg {
  font-size: 13px;
}
.disabled-tip,
.empty {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  padding: 20px;
  background: var(--bg);
  border-radius: 8px;
}
.srv-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #fff;
  margin-bottom: 14px;
  overflow: hidden;
}
.srv-card.error {
  border-color: #fecaca;
}
.srv-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--bg);
}
.sname {
  font-weight: 700;
  font-size: 14px;
}
.badge {
  font-size: 11px;
  background: #f1f5f9;
  border-radius: 4px;
  padding: 1px 6px;
  color: #64748b;
}
.status-text {
  margin-left: auto;
  font-size: 12px;
  color: #9ca3af;
}
.cmd {
  padding: 8px 14px;
  font-family: 'SF Mono', Menlo, monospace;
  font-size: 11px;
  color: #64748b;
  border-bottom: 1px dashed var(--border);
}
.tools {
  padding: 8px 14px;
}
.tool-row {
  padding: 4px 0;
}
.tool-row code {
  font-size: 12px;
  background: #ecfdf5;
  color: #065f46;
  padding: 2px 8px;
  border-radius: 4px;
}
.empty-tools {
  font-size: 12px;
  color: #9ca3af;
}
</style>
