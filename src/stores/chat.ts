/**
 * 聊天 store —— 消费 SSE 事件流，驱动 UI 状态
 *
 * 核心状态机：
 *   isStreaming=true 期间，text_delta 追加到"当前 assistant 消息"，
 *   tool_start/tool_result 更新其 toolCalls 数组；
 *   done / error / 异常 都必须把 isStreaming 复位（否则永远转圈）。
 */

import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import { cancelChat, streamChat } from '../api/chat'
import { fetchMessages } from '../api/conversations'
import { useConversationsStore } from './conversations'
import { adaptHistory } from '../utils/historyAdapter'
import type { AskField, UiMessage } from '../types/sse'

let msgSeq = 0

// 协作式取消的兜底硬断：cancel 请求发了但 interrupted/done 迟迟不来
// （后端挂起/网络断）时，超时后强制断开 fetch 连接
const FORCE_ABORT_MS = 3000

export const useChatStore = defineStore('chat', () => {
  const sessionId = ref('')
  const messages = ref<UiMessage[]>([])
  const isStreaming = ref(false)
  const lastUsage = ref<{ input_tokens: number; output_tokens: number } | null>(null)
  const lastError = ref('')
  // HITL：Agent 提问后置位 → 输入框 placeholder 变成"回答 Agent 的问题…"；
  // 用户发出下一条消息即视为回答，sendMessage 开头清掉
  const pendingAsk = ref<{ question: string; fields: AskField[] } | null>(null)
  const conversations = useConversationsStore()

  let abortController: AbortController | null = null
  let forceAbortTimer: ReturnType<typeof setTimeout> | null = null

  function clearAbortGuards() {
    if (forceAbortTimer) {
      clearTimeout(forceAbortTimer)
      forceAbortTimer = null
    }
    abortController = null
  }

  async function sendMessage(text: string) {
    if (isStreaming.value || !text.trim()) return
    lastError.value = ''
    isStreaming.value = true
    abortController = new AbortController()
    pendingAsk.value = null   // 发出的这条就是回答（或新问题），提问态结束

    // 用户消息 + 预建一条空的 assistant 消息（流式内容往里追加）
    messages.value.push({ id: `m${++msgSeq}`, role: 'user', content: text, toolCalls: [] })

    // ⚠️ 必须用 reactive() 创建：如果先建普通对象再 push 进响应式数组，
    // 后续通过局部变量修改的是【原始对象】而非代理，变更不会触发重渲染
    // —— 这是 Vue3 响应式最常见的陷阱（症状：数据在、界面不动）
    const assistant = reactive<UiMessage>({ id: `m${++msgSeq}`, role: 'assistant', content: '', toolCalls: [] })
    messages.value.push(assistant)

    try {
      for await (const ev of streamChat(sessionId.value, text, conversations.pendingProjectId, abortController.signal)) {
        switch (ev.event) {
          case 'message_start':
            sessionId.value = ev.session_id
            break
          case 'text_delta':
            assistant.content += ev.text
            break
          case 'tool_start':
            assistant.toolCalls.push({
              tool_use_id: ev.tool_use_id, name: ev.name, input: ev.input, status: 'running',
            })
            break
          case 'tool_result': {
            // 同一条 assistant 消息里可能有多个工具调用，按 id 定位
            const tc = assistant.toolCalls.find((t) => t.tool_use_id === ev.tool_use_id)
            if (tc) {
              tc.status = ev.is_error ? 'error' : 'done'
              tc.content = ev.content
              tc.duration_ms = ev.duration_ms
            }
            break
          }
          case 'artifact':
            // 工具产出的文件（PDF/图表）挂到当前 assistant 消息下
            if (!assistant.artifacts) assistant.artifacts = []
            assistant.artifacts.push(ev)
            break
          case 'subagent_start':
            if (!assistant.subagents) assistant.subagents = []
            assistant.subagents.push({ id: ev.id, name: ev.name, task: ev.task, status: 'running' })
            break
          case 'subagent_result': {
            const sub = assistant.subagents?.find((s) => s.id === ev.id)
            if (sub) {
              sub.status = 'done'
              sub.summary = ev.summary
            }
            break
          }
          case 'ask_user':
            // Agent 在等用户输入：消息上挂提问卡片 + 置位提问态（done 随后到达收尾）
            assistant.askUser = { question: ev.question, fields: ev.fields ?? [] }
            pendingAsk.value = { question: ev.question, fields: ev.fields ?? [] }
            break
          case 'error':
            lastError.value = ev.message
            break
          case 'interrupted':
            // 后端已在安全点退出、部分回答已落库 —— 打个视觉标记即可
            assistant.content += '\n\n*（已中断）*'
            clearAbortGuards()
            break
          case 'done':
            lastUsage.value = ev.usage
            // P7: 轨迹挂到当前 assistant 消息，TraceView 可展开回放
            assistant.trace = { trace: ev.trace, wall_ms: ev.wall_ms }
            // 新会话的标题是 done 后异步生成的 —— 立即刷一次 + 3s 兜底再刷
            conversations.refresh()
            setTimeout(() => conversations.refresh(), 3000)
            break
        }
      }
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
    } finally {
      // 兜底：无论正常/异常，必须复位流式状态
      if (!assistant.content && !assistant.toolCalls.length) {
        assistant.content = lastError.value ? `❌ ${lastError.value}` : '（无输出）'
      }
      clearAbortGuards()
      isStreaming.value = false
    }
  }

  /** 停止按钮：协作式取消为主（部分回答落库），超时后硬断连接兜底 */
  async function stop() {
    if (!isStreaming.value) return
    const sid = sessionId.value
    try {
      await cancelChat(sid)
    } catch {
      // cancel 请求失败不致命 —— 还有下面的硬断兜底
    }
    if (forceAbortTimer) clearTimeout(forceAbortTimer)
    forceAbortTimer = setTimeout(() => {
      // 正常情况后端会先推 interrupted+done 让流自然结束；走到这里说明
      // 后端没响应取消（挂起/网络已断），只能硬断，部分内容可能不落库
      abortController?.abort()
    }, FORCE_ABORT_MS)
  }

  /** 新会话（侧边栏"新对话"按钮触发；在项目分组里点则带上项目归属） */
  function newSession(projectId: string | null = null) {
    sessionId.value = ''
    messages.value = []
    lastUsage.value = null
    lastError.value = ''
    pendingAsk.value = null
    conversations.activeId = ''
    conversations.pendingProjectId = projectId
  }

  /** 加载历史会话（侧边栏点击切换触发） */
  async function loadConversation(id: string) {
    if (isStreaming.value) return
    newSession()
    sessionId.value = id
    conversations.activeId = id
    try {
      // 后端原始块列表 → UI 消息（工具调用配对在 adaptHistory 里完成）
      const data = await fetchMessages(id)
      messages.value = adaptHistory(data.messages, data.artifacts ?? [], data.traces ?? [])
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
    }
  }

  return { sessionId, messages, isStreaming, lastUsage, lastError, pendingAsk, sendMessage, stop, newSession, loadConversation }
})
