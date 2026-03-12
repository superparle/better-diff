// Types for Claude Code transcript messages

export interface SystemInitMessage {
  type: "system"
  subtype: "init"
  cwd: string
  session_id: string
  tools: string[]
  model: string
}

export interface TextContent {
  type: "text"
  text: string
}

export interface ToolUseContent {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultContent {
  type: "tool_result"
  tool_use_id: string
  content: string
  is_error?: boolean
}

export interface AssistantMessage {
  type: "assistant"
  message: {
    id: string
    role: "assistant"
    content: (TextContent | ToolUseContent)[]
  }
  session_id: string
}

export interface UserToolResultMessage {
  type: "user"
  message: {
    role: "user"
    content: ToolResultContent[]
  }
  session_id: string
}

export interface ResultMessage {
  type: "result"
  subtype: "success" | "error" | "cancelled"
  is_error: boolean
  duration_ms: number
  result: string
  session_id?: string
  total_cost_usd?: number
}

export type TranscriptMessage =
  | SystemInitMessage
  | AssistantMessage
  | UserToolResultMessage
  | ResultMessage

// Processed message types for display
export interface ProcessedTextMessage {
  id: string
  kind: "text"
  text: string
  timestamp: string
}

export interface MessageInput {
  [key: string]: unknown
  subagent_type?: string
  description?: string
  url?: string
  file_path?: string
  skill?: string
  args?: string
  name?: string
  pattern?: string
  query?: string
  result?: string
}

export interface ProcessedToolCall {
  id: string
  kind: "tool"
  toolName: string
  toolId: string
  input: MessageInput
  result?: string
  isError?: boolean
  timestamp: string
}

export interface McpServerInfo {
  name: string
  status: string
  error?: string
}

export interface AccountInfo {
  email?: string
  organization?: string
  subscriptionType?: string
  tokenSource?: string
  apiKeySource?: string
}

export interface ProcessedSystemMessage {
  id: string
  kind: "system"
  model: string
  tools: string[]
  agents: string[]
  slashCommands: string[]
  mcpServers: McpServerInfo[]
  timestamp: string
}

export interface ProcessedAccountInfoMessage {
  id: string
  kind: "account_info"
  accountInfo: AccountInfo
  timestamp: string
}

export interface ProcessedResultMessage {
  id: string
  kind: "result"
  success: boolean
  cancelled?: boolean
  result: string
  durationMs: number
  costUsd?: number
  timestamp: string
}

export interface ProcessedCompactBoundaryMessage {
  id: string
  kind: "compact_boundary"
  timestamp: string
}

export interface ProcessedCompactSummaryMessage {
  id: string
  kind: "compact_summary"
  summary: string
  timestamp: string
}

export interface ProcessedContextClearedMessage {
  id: string
  kind: "context_cleared"
  timestamp: string
}

export interface ProcessedStatusMessage {
  id: string
  kind: "status"
  status: string
  timestamp: string
}

export interface ProcessedInterruptedMessage {
  id: string
  kind: "interrupted"
  timestamp: string
}

// AskUserQuestion types (used for parsing input/result of AskUserQuestion tool)
export interface AskUserQuestionOption {
  label: string
  description?: string
}

export interface AskUserQuestionItem {
  question: string
  header?: string
  options?: AskUserQuestionOption[]
  multiSelect?: boolean
}

export type ProcessedMessage =
  | ProcessedTextMessage
  | ProcessedToolCall
  | ProcessedSystemMessage
  | ProcessedAccountInfoMessage
  | ProcessedResultMessage
  | ProcessedCompactBoundaryMessage
  | ProcessedCompactSummaryMessage
  | ProcessedContextClearedMessage
  | ProcessedStatusMessage
  | ProcessedInterruptedMessage
