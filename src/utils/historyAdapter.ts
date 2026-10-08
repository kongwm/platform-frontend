/**
 * 历史消息适配器 —— Anthropic 块列表 → UI 消息模型
 * ==================================================
 *
 * 存储格式（后端）与展示格式（前端）不是一回事：
 *   存储: user("现在几点") / assistant(text + tool_use) / user(tool_result)
 *          ↑ 工具结果作为独立 user 轮 —— API 要求的形状
 *   展示: assistant 消息自带 toolCalls[]（工具步骤挂在它名下）
 *
 * 组装规则（和实时流式时 store 的做法保持一致）：
 *   ① role='summary' 跳过（压缩产物，最小版不渲染）
 *   ② user 首块是 tool_result → 不新建消息，按 tool_use_id 回填
 *      到前一条 assistant 的 toolCalls（配对逻辑，正是后端循环的镜像）
 *   ③ user 纯文本 → 新消息
 *   ④ assistant → text 块拼 content，tool_use 块 push toolCall(status: done)
 */

import type { Artifact, AskField, RunTrace, UiMessage } from '../types/sse'
import type { RawMessage } from '../api/conversations'

let seq = 0

export function adaptHistory(
  raw: RawMessage[],
  artifacts: Artifact[] = [],
  traces: RunTrace[] = [],
): UiMessage[] {
  const out: UiMessage[] = []

  // 简化：会话的全部产出物挂在最后一条 assistant 消息下（无消息级关联）
  const lastAssistant = () => {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].role === 'assistant') return out[i]
    }
    return null
  }

  // P7: runIdx 数"用户提问轮次"（tool_result 也是 user 轮但不计数），
  // traces[runIdx] 挂到该轮产生的 assistant 消息上 —— 与后端
  // "1 run = 1 user turn = 1 行 run_trace" 的落库约定对齐
  let runIdx = -1

  for (const msg of raw) {
    if (msg.role === 'summary') continue   // ①

    const blocks = msg.content as Array<{ type: string; [k: string]: unknown }>
    const firstIsToolResult = blocks[0]?.type === 'tool_result'

    if (msg.role === 'user' && firstIsToolResult) {
      // ② 工具结果回填到前一条 assistant
      const prev = out[out.length - 1]
      for (const b of blocks) {
        if (b.type !== 'tool_result') continue
        const tc = prev?.toolCalls.find((t) => t.tool_use_id === b.tool_use_id)
        if (tc) {
          tc.status = b.is_error ? 'error' : 'done'
          tc.content = String(b.content ?? '')
          // P7.7 L3：被审批门拦下的调用（占位结果以【等待审批】开头）不按
          // 工具步骤展示，转成只读审批卡片 —— 与实时流的 approval_request
          // 渲染同源。后续真正执行的调用不受影响（结果无此前缀）
          if (tc.content.startsWith('【等待审批】') && prev) {
            prev.approval = {
              tool: tc.name, input: tc.input,
              tool_use_id: tc.tool_use_id, resolved: 'replay',
            }
            prev.toolCalls = prev.toolCalls.filter((t) => t !== tc)
          }
        }
      }
      continue
    }

    if (msg.role === 'user') {
      // ③ 用户纯文本（多 text 块拼接）
      const text = blocks.filter((b) => b.type === 'text').map((b) => String(b.text)).join('\n')
      out.push({ id: `h${seq++}`, role: 'user', content: text, toolCalls: [] })
      runIdx++
      continue
    }

    // ④ assistant：text 拼 content；tool_use 挂 toolCalls
    //    例外：ask_user 不算工具步骤，转成提问卡片（历史回放与实时流同源）
    const content = blocks.filter((b) => b.type === 'text').map((b) => String(b.text)).join('')
    const askBlock = blocks.find(
      (b) => b.type === 'tool_use' && b.name === 'ask_user',
    ) as { input?: { question?: string; fields?: AskField[] } } | undefined
    const toolCalls = blocks
      .filter((b) => b.type === 'tool_use' && b.name !== 'ask_user')
      .map((b) => ({
        tool_use_id: String(b.id),
        name: String(b.name),
        input: (b.input ?? {}) as Record<string, unknown>,
        status: 'done' as const,
      }))
    const uiMsg: UiMessage = { id: `h${seq++}`, role: 'assistant', content, toolCalls }
    if (askBlock?.input?.question) {
      uiMsg.askUser = { question: askBlock.input.question, fields: askBlock.input.fields ?? [] }
    }
    out.push(uiMsg)
    const tr = traces[runIdx]
    if (tr) out[out.length - 1].trace = tr   // 该轮 run 的轨迹回放（P7）
  }

  if (artifacts.length) {
    const target = lastAssistant()
    if (target) target.artifacts = artifacts
  }

  return out
}
