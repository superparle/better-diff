import { generateUUID } from "./utils"
import type { ProcessedMessage, ProcessedToolCall } from "../components/messages/types"

export interface Message {
  id: string
  messageId?: string
  role: "user" | "assistant"
  content: string
  timestamp: string
  processed?: ProcessedMessage
  rawJson?: string
  hidden?: boolean
}

interface ParsedTranscriptMessage {
  processed: ProcessedMessage | null
  rawJson: string
  isUserMessage?: boolean
  userContent?: string
}

function formatJsonPretty(jsonString: string): string {
  try {
    return JSON.stringify(JSON.parse(jsonString), null, 2)
  } catch {
    return jsonString
  }
}

function createTimestamp(): string {
  return new Date().toISOString()
}

function parseTranscriptMessage(
  jsonStr: string,
  pendingToolCalls: Map<string, ProcessedToolCall>
): ParsedTranscriptMessage {
  const rawJson = formatJsonPretty(jsonStr)
  const emptyResult = { processed: null, rawJson }

  try {
    const data = JSON.parse(jsonStr)

    // User prompt message (stored by worker)
    if (data.type === "user_prompt" && data.content) {
      return { ...emptyResult, isUserMessage: true, userContent: data.content }
    }

    // System init message
    if (data.type === "system" && data.subtype === "init") {
      return {
        processed: {
          id: generateUUID(),
          kind: "system",
          model: data.model || "unknown",
          tools: data.tools || [],
          agents: data.agents || [],
          slashCommands: data.slash_commands?.filter((e: string) => !e.startsWith("._")) || [],
          mcpServers: data.mcp_servers || [],
          timestamp: createTimestamp(),
        },
        rawJson,
      }
    }

    // Account info message
    if (data.type === "system" && data.subtype === "account_info") {
      return {
        processed: {
          id: generateUUID(),
          kind: "account_info",
          accountInfo: data.accountInfo,
          timestamp: createTimestamp(),
        },
        rawJson,
      }
    }

    // Assistant message with text or tool_use
    if (data.type === "assistant" && data.message?.content) {
      for (const content of data.message.content) {
        if (content.type === "text" && content.text) {
          return {
            processed: {
              id: generateUUID(),
              kind: "text",
              text: content.text,
              timestamp: createTimestamp(),
            },
            rawJson,
          }
        }

        if (content.type === "tool_use") {
          const toolCall: ProcessedToolCall = {
            id: generateUUID(),
            kind: "tool",
            toolName: content.name,
            toolId: content.id,
            input: content.input || {},
            timestamp: createTimestamp(),
          }
          pendingToolCalls.set(content.id, toolCall)
          return { processed: toolCall, rawJson }
        }
      }
    }

    // User message with tool_result - update existing pending tool call
    if (data.type === "user" && data.message?.content) {
      for (const content of data.message.content) {
        if (content.type === "tool_result" && content.tool_use_id) {
          const pendingCall = pendingToolCalls.get(content.tool_use_id)
          if (pendingCall) {
            pendingCall.result = content.content || "(empty)"
            pendingCall.isError = content.is_error || false
            pendingToolCalls.delete(content.tool_use_id)
            return emptyResult
          }
        }
      }
    }

    // Result message
    if (data.type === "result") {
      // Cancelled/interrupted gets its own message type
      if (data.subtype === "cancelled") {
        return {
          processed: {
            id: generateUUID(),
            kind: "interrupted",
            timestamp: createTimestamp(),
          },
          rawJson,
        }
      }

      return {
        processed: {
          id: generateUUID(),
          kind: "result",
          success: !data.is_error,
          result: data.result || "",
          durationMs: data.duration_ms || 0,
          costUsd: data.total_cost_usd,
          timestamp: createTimestamp(),
        },
        rawJson,
      }
    }

    // Status message (e.g., compacting)
    if (data.type === "system" && data.subtype === "status" && data.status) {
      return {
        processed: {
          id: generateUUID(),
          kind: "status",
          status: data.status,
          timestamp: createTimestamp(),
        },
        rawJson,
      }
    }

    // Compact boundary message
    if (data.type === "system" && data.subtype === "compact_boundary") {
      return {
        processed: {
          id: generateUUID(),
          kind: "compact_boundary",
          timestamp: createTimestamp(),
        },
        rawJson,
      }
    }

    // Context cleared boundary message
    if (data.type === "system" && data.subtype === "context_cleared") {
      return {
        processed: {
          id: generateUUID(),
          kind: "context_cleared",
          timestamp: createTimestamp(),
        },
        rawJson,
      }
    }

    // User message that is a compact summary
    if (data.type === "user" && data.message?.role === "user" && typeof data.message.content === "string") {
      if (data.message.content.startsWith("This session is being continued")) {
        return {
          processed: {
            id: generateUUID(),
            kind: "compact_summary",
            summary: data.message.content,
            timestamp: createTimestamp(),
          },
          rawJson,
        }
      }
    }

    return emptyResult
  } catch {
    return emptyResult
  }
}

/**
 * Process raw Convex messages into display-ready Message objects.
 * Encapsulates all transcript parsing logic including tool call pairing.
 */
export function processTranscriptMessages(
  convexMessages: { _id: string; message: string; messageId?: string; createdAt: number; hidden?: boolean }[]
): Message[] {
  const pendingToolCalls = new Map<string, ProcessedToolCall>()
  const messages: Message[] = []

  for (const convexMsg of convexMessages) {
    const { processed, rawJson, isUserMessage, userContent } = parseTranscriptMessage(
      convexMsg.message,
      pendingToolCalls
    )

    if (isUserMessage && userContent) {
      messages.push({
        id: convexMsg._id,
        messageId: convexMsg.messageId,
        role: "user",
        content: userContent,
        timestamp: new Date(convexMsg.createdAt).toISOString(),
        hidden: convexMsg.hidden,
      })
      continue
    }

    if (processed === null) continue

    messages.push({
      id: convexMsg._id,
      messageId: convexMsg.messageId,
      role: "assistant",
      content: rawJson,
      timestamp: new Date(convexMsg.createdAt).toISOString(),
      processed,
      rawJson,
      hidden: convexMsg.hidden,
    })
  }

  return messages
}
