/**
 * 聊天 store —— 消费 SSE 事件流，驱动 UI 状态
 *
 * 核心状态机：
 *   isStreaming=true 期间，text_delta 追加到"当前 assistant 消息"，
 *   tool_start/tool_result 更新其 toolCalls 数组；
 *   done / error / 异常 都必须把 isStreaming 复位（否则永远转圈）。
 *
 * 并行会话（P7.6 扩展）：流的生命周期归 store、不归视图 ——
 * SSE 连接由 sendMessage 的 for-await 循环持有，切走会话不打断生成。
 * 状态按会话 id 分视图存储（views Map）：后台流的事件继续写进自己的
 * 视图；切回来时内存视图优先于后端历史（单客户端下内存永远最新，
 * 且后端在 2b 才落库，正在流式的尾部只有内存里有）。
 */

import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { approveChat, cancelChat, streamChat } from '../api/chat'
import { fetchMessages } from '../api/conversations'
import { useConversationsStore } from './conversations'
import { adaptHistory } from '../utils/historyAdapter'
import type { AskField, UiMessage } from '../types/sse'

let msgSeq = 0

// 协作式取消的兜底硬断：cancel 请求发了但 interrupted/done 迟迟不来
// （后端挂起/网络断）时，超时后强制断开 fetch 连接
const FORCE_ABORT_MS = 3000

/** 单个会话的视图状态：消息列表 + 该会话自己的流状态 */
interface SessionView {
  messages: UiMessage[]
  streaming: boolean
  usage: { input_tokens: number; output_tokens: number } | null
  error: string
  pendingAsk: { question: string; fields: AskField[] } | null
  abort: AbortController | null
  timer: ReturnType<typeof setTimeout> | null
}

export const useChatStore = defineStore('chat', () => {
  // 当前激活视图的 key（'' = 尚未落库的新会话，message_start 后换真 id）
  const sessionId = ref('')
  const conversations = useConversationsStore()

  // ⚠️ 流状态按会话隔离：切走后 for-await 继续写同一个 view 对象，
  // 与"哪个视图在前台"无关 —— 这就是"允许切走、后台继续"的全部基础
  const views = reactive(new Map<string, SessionView>())

  function view(id: string): SessionView {
    let v = views.get(id)
    if (!v) {
      v = reactive<SessionView>({
        messages: [], streaming: false, usage: null,
        error: '', pendingAsk: null, abort: null, timer: null,
      })
      views.set(id, v)
    }
    return v
  }

  const active = computed(() => view(sessionId.value))

  // 对外保持与单会话版同名 —— 组件层零改动，语义变为"当前激活视图的"
  const messages = computed(() => active.value.messages)
  const isStreaming = computed(() => active.value.streaming)
  const lastUsage = computed(() => active.value.usage)
  const lastError = computed(() => active.value.error)
  const pendingAsk = computed(() => active.value.pendingAsk)

  function clearGuards(v: SessionView) {
    if (v.timer) {
      clearTimeout(v.timer)
      v.timer = null
    }
    v.abort = null
  }

  async function sendMessage(text: string) {
    const v = active.value
    if (v.streaming || !text.trim()) return
    const sentFrom = sessionId.value        // '' = 全新会话，message_start 后换真 id
    v.error = ''
    v.streaming = true
    v.abort = new AbortController()
    v.pendingAsk = null   // 发出的这条就是回答（或新问题），提问态结束

    // 用户消息 + 预建一条空的 assistant 消息（流式内容往里追加）
    v.messages.push({ id: `m${++msgSeq}`, role: 'user', content: text, toolCalls: [] })

    // ⚠️ 必须用 reactive() 创建：如果先建普通对象再 push 进响应式数组，
    // 后续通过局部变量修改的是【原始对象】而非代理，变更不会触发重渲染
    // —— 这是 Vue3 响应式最常见的陷阱（症状：数据在、界面不动）
    const assistant = reactive<UiMessage>({ id: `m${++msgSeq}`, role: 'assistant', content: '', toolCalls: [] })
    v.messages.push(assistant)

    try {
      for await (const ev of streamChat(sessionId.value, text, conversations.pendingProjectId, v.abort.signal)) {
        switch (ev.event) {
          case 'message_start':
            // 新会话拿到真 id：把视图换 key。用户已切走时不拽回前台，
            // 只静默换 key（后台流继续，侧边栏刷新后可点回）
            if (ev.session_id !== sentFrom) {
              views.set(ev.session_id, v)
              views.delete(sentFrom)
              if (sessionId.value === sentFrom) {
                sessionId.value = ev.session_id
                conversations.activeId = ev.session_id
              }
            }
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
            v.pendingAsk = { question: ev.question, fields: ev.fields ?? [] }
            break
          case 'approval_request':
            // 危险工具被拦截（P7.7 L3）：挂审批卡片，done 随后收尾本轮流
            assistant.approval = {
              tool: ev.tool, input: ev.input, tool_use_id: ev.tool_use_id,
            }
            break
          case 'error':
            // P7.7 新契约：脱敏错误体 {id, category, message}；旧形状（裸
            // message）过渡期兼容。展示取归类短文案，id 供报障用
            v.error = ev.error?.message ?? ev.message ?? '未知错误'
            break
          case 'interrupted':
            // 后端已在安全点退出、部分回答已落库 —— 打个视觉标记即可
            assistant.content += '\n\n*（已中断）*'
            clearGuards(v)
            break
          case 'done':
            v.usage = ev.usage
            // P7: 轨迹挂到当前 assistant 消息，TraceView 可展开回放
            assistant.trace = { trace: ev.trace, wall_ms: ev.wall_ms }
            // 新会话的标题是 done 后异步生成的 —— 立即刷一次 + 3s 兜底再刷
            conversations.refresh()
            setTimeout(() => conversations.refresh(), 3000)
            break
        }
      }
    } catch (e) {
      v.error = e instanceof Error ? e.message : String(e)
    } finally {
      // 兜底：无论正常/异常，必须复位流式状态
      if (!assistant.content && !assistant.toolCalls.length) {
        assistant.content = v.error ? `❌ ${v.error}` : '（无输出）'
      }
      clearGuards(v)
      v.streaming = false
    }
  }

  /** 审批卡片回应（P7.7 L3）：确认 = 先写一次性批准标记再续发消息让模型
   *  重调工具；取消 = 不写标记直接发拒绝消息。都作为下一轮普通消息走，
   *  与 ask_user 的"当轮收尾、下一轮衔接"同一套机制 */
  async function respondApproval(approved: boolean) {
    const v = active.value
    // 找最近一条待处理的审批卡片（resolved 未置位的）
    const holder = [...v.messages].reverse().find((m) => m.approval && !m.approval.resolved)
    if (!holder?.approval) return
    const sid = sessionId.value
    if (!sid) return   // 审批必然发生在已落库会话（前面已有对话轮）
    try {
      await approveChat(sid, approved)
    } catch (e) {
      v.error = e instanceof Error ? e.message : String(e)
      return
    }
    holder.approval.resolved = 'replay'   // 按钮用掉后卡片转为只读
    await sendMessage(
      approved
        ? '【审批】用户已确认该操作，请继续执行。'
        : '【审批】用户取消了该操作，请不要执行，简单告知用户已取消即可。',
    )
  }

  /** 停止按钮：协作式取消为主（部分回答落库），超时后硬断连接兜底。
   *  只作用于【当前前台】会话的流；后台流回到那个会话再停 */
  async function stop() {
    const v = active.value
    if (!v.streaming) return
    const sid = sessionId.value
    try {
      await cancelChat(sid)
    } catch {
      // cancel 请求失败不致命 —— 还有下面的硬断兜底
    }
    if (v.timer) clearTimeout(v.timer)
    v.timer = setTimeout(() => {
      // 正常情况后端会先推 interrupted+done 让流自然结束；走到这里说明
      // 后端没响应取消（挂起/网络已断），只能硬断，部分内容可能不落库
      v.abort?.abort()
    }, FORCE_ABORT_MS)
  }

  /** 新会话（侧边栏"新对话"按钮触发；在项目分组里点则带上项目归属）。
   *  只切换前台视图，【不动任何后台流】——别的会话该跑继续跑 */
  function newSession(projectId: string | null = null) {
    const v = view('')
    // 只有空闲的"未落库"视图才清空；若上一次新会话的消息刚发出、
    // message_start 还没来得及换 key（亚秒窗口），留着它，换 key 后自然腾空
    if (!v.streaming) {
      v.messages = []
      v.usage = null
      v.error = ''
      v.pendingAsk = null
    }
    sessionId.value = ''
    conversations.activeId = ''
    conversations.pendingProjectId = projectId
  }

  /** 加载历史会话（侧边栏点击切换触发）。
   *  内存里已有视图（可能在后台流式/刚完成）直接用 —— 单客户端下内存
   *  比后端历史新（流式尾部 2b 才落库），重拉反而丢实时内容 */
  async function loadConversation(id: string) {
    if (sessionId.value === id) return
    sessionId.value = id
    conversations.activeId = id
    if (views.has(id)) return
    const v = view(id)
    try {
      // 后端原始块列表 → UI 消息（工具调用配对在 adaptHistory 里完成）
      const data = await fetchMessages(id)
      v.messages = adaptHistory(data.messages, data.artifacts ?? [], data.traces ?? [])
    } catch (e) {
      v.error = e instanceof Error ? e.message : String(e)
    }
  }

  /** 某会话是否正在生成（含后台流）—— 侧边栏"生成中"指示用 */
  function sessionStreaming(id: string): boolean {
    return views.get(id)?.streaming ?? false
  }

  /** 删除会话前的清理：后台流也要先取消（否则 run 继续往已删会话 append，
   *  消息行会以孤儿形式重建）；驱逐视图缓存；删的是前台会话则回到新会话 */
  async function closeSession(id: string) {
    const v = views.get(id)
    if (v?.streaming) {
      try {
        await cancelChat(id)
      } catch {
        // cancel 失败不致命 —— 下面同样有硬断兜底
      }
      if (v.timer) clearTimeout(v.timer)
      v.timer = setTimeout(() => v.abort?.abort(), FORCE_ABORT_MS)
    }
    views.delete(id)   // 流的 for-await 拿着 v 的引用继续写，驱逐后写入自然无效
    if (sessionId.value === id) newSession(conversations.pendingProjectId)
  }

  return { sessionId, messages, isStreaming, lastUsage, lastError, pendingAsk, sendMessage, respondApproval, stop, newSession, loadConversation, sessionStreaming, closeSession }
})
