/**
 * SSE 事件契约 —— 与后端 app/api/chat.py 共享的"协议"
 *
 * 两端只认这份类型定义。改事件结构必须同时改这里和后端。
 */

export type SseEvent =
  | MessageStartEvent
  | TextDeltaEvent
  | ToolStartEvent
  | ToolResultEvent
  | LlmCallEvent
  | ArtifactEvent
  | SubagentStartEvent
  | SubagentResultEvent
  | AskUserEvent
  | SseErrorEvent
  | InterruptedEvent
  | DoneEvent

export interface MessageStartEvent {
  event: 'message_start'
  session_id: string
}

export interface TextDeltaEvent {
  event: 'text_delta'
  text: string
}

export interface ToolStartEvent {
  event: 'tool_start'
  tool_use_id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultEvent {
  event: 'tool_result'
  tool_use_id: string
  name: string
  content: string
  is_error: boolean
  duration_ms: number
}

export interface LlmCallEvent {
  event: 'llm_call'
  iteration: number
  model: string
  stop_reason: string
  usage: { input_tokens: number; output_tokens: number }
}

export interface SseErrorEvent {
  event: 'error'
  message: string
}

/** 会话产出物（P4）：PDF/图表文件，聊天内展示可下载 */
export interface Artifact {
  id: string
  type: 'pdf' | 'image' | 'md'
  filename: string
  url: string
}

export interface ArtifactEvent extends Artifact {
  event: 'artifact'
}

/** 子智能体派发（P5）：主 Agent 把任务委派给子 Agent 执行 */
export interface SubagentCall {
  id: string
  name: string
  task?: string
  status: 'running' | 'done'
  summary?: string
}

export interface SubagentStartEvent {
  event: 'subagent_start'
  id: string
  name: string
  task: string
}

export interface SubagentResultEvent {
  event: 'subagent_result'
  id: string
  name: string
  summary: string
}

/** HITL 提问（P7.5）：Agent 缺必要信息，请求用户在输入框回答 */
export interface AskField {
  name: string
  label: string
  required?: boolean
}

export interface AskUserEvent {
  event: 'ask_user'
  question: string
  fields: AskField[]
}

/** 用户点了停止：后端已在安全点退出，部分回答已落库（done 随后必到） */
export interface InterruptedEvent {
  event: 'interrupted'
}

/** 运行轨迹（P7）：一次 agent run 的扁平事件，前端按 iteration 分组成两层树 */
export interface LlmCallTrace {
  type: 'llm_call'
  iteration: number
  model: string
  stop_reason: string
  wall_ms: number
  input_tokens: number
  output_tokens: number
}

export interface ToolCallTrace {
  type: 'tool_call'
  iteration: number
  tool: string
  input: Record<string, unknown>
  result: string
  latency_ms: number
}

export type TraceEvent = LlmCallTrace | ToolCallTrace

/** 一轮 run 的轨迹整包（done 事件实时带 / 历史接口按轮返回） */
export interface RunTrace {
  id?: string
  trace: TraceEvent[]
  wall_ms: number
  created_at?: string
}

export interface DoneEvent {
  event: 'done'
  trace: TraceEvent[]
  usage: { input_tokens: number; output_tokens: number }
  iterations: number
  wall_ms: number
}

/** 前端 UI 用的消息模型（一条 assistant 消息可能穿插多段工具调用） */
export interface ToolCall {
  tool_use_id: string
  name: string
  input: Record<string, unknown>
  status: 'running' | 'done' | 'error'
  content?: string
  duration_ms?: number
}

export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls: ToolCall[]
  artifacts?: Artifact[]   // 该消息产出的文件（P4）
  subagents?: SubagentCall[]   // 该消息派发的子智能体（P5）
  askUser?: { question: string; fields: AskField[] }   // 该消息向用户发起的提问（P7.5）
  trace?: RunTrace         // 产生该消息那轮 run 的运行轨迹（P7）
}
