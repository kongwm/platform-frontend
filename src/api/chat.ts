/**
 * SSE 客户端 —— fetch POST + ReadableStream 手动解析
 *
 * 为什么不用浏览器 EventSource？
 *   EventSource 只支持 GET，无法 POST 消息体。所以用 fetch 流式读取，
 *   自己解析 SSE 帧（`event: xxx\ndata: {...}\n\n`）。
 */

import type { SseEvent } from '../types/sse'

const API_BASE = 'http://localhost:8000'

export async function* streamChat(
  sessionId: string,
  message: string,
  projectId?: string | null,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const resp = await fetch(`${API_BASE}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // signal 仅作兜底硬断（协作式取消超时后强制断开），正常路径用 cancel 端点
    signal,
    body: JSON.stringify({
      session_id: sessionId || null,
      // 新会话才需要带项目归属；老会话后端忽略该字段
      project_id: sessionId ? null : projectId || null,
      message,
    }),
  })

  if (!resp.ok || !resp.body) {
    throw new Error(`请求失败: HTTP ${resp.status}`)
  }

  // === 手动解析 SSE 帧：按 \n\n 切帧，帧内再取 event:/data: 行 ===
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)

      let eventName = ''
      let data = ''
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) eventName = line.slice(7)
        else if (line.startsWith('data: ')) data = line.slice(6)
      }
      if (!data) continue

      try {
        // data 里的 JSON 自带 event 字段，直接就是类型判别依据
        yield JSON.parse(data) as SseEvent
      } catch {
        console.warn('无法解析 SSE data:', eventName, data)
      }
    }
  }
}

/**
 * 中断生成 —— 协作式取消：后端在安全点优雅退出（部分回答落库），
 * 流里会推 interrupted + done 事件正常收尾，前端不需要硬断连接。
 * 返回 cancelled:false 表示该会话当前没在生成（调用方无需处理）。
 */
export async function cancelChat(sessionId: string): Promise<boolean> {
  const resp = await fetch(`${API_BASE}/api/chat/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })
  if (!resp.ok) throw new Error(`取消失败: HTTP ${resp.status}`)
  const data = await resp.json()
  return data.cancelled === true
}
