import { useState, useMemo } from "react"
import { ChevronRight } from "lucide-react"
import { ToolCallMessage } from "./ToolCallMessage"
import { MetaRow, MetaLabel } from "./shared"
import { AnimatedShinyText } from "../ui/animated-shiny-text"
import type { ProcessedToolCall } from "./types"
import type { Message } from "../../lib/parseTranscript"

interface ToolCategory {
  key: string
  singular: string
  plural: string
}

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  Read: { key: "read", singular: "read", plural: "reads" },
  Edit: { key: "edit", singular: "edit", plural: "edits" },
  Write: { key: "write", singular: "write", plural: "writes" },
  Bash: { key: "bash", singular: "command", plural: "commands" },
  Grep: { key: "grep", singular: "search", plural: "searches" },
  Glob: { key: "glob", singular: "glob", plural: "globs" },
  Task: { key: "task", singular: "agent", plural: "agents" },
  WebFetch: { key: "webfetch", singular: "fetch", plural: "fetches" },
  WebSearch: { key: "websearch", singular: "web search", plural: "web searches" },
  Skill: { key: "skill", singular: "skill", plural: "skills" },
  TodoWrite: { key: "todo", singular: "todo update", plural: "todo updates" },
}

const DB_QUERY_CATEGORY: ToolCategory = { key: "dbquery", singular: "query", plural: "queries" }
const OTHER_CATEGORY: ToolCategory = { key: "other", singular: "tool call", plural: "tool calls" }

function getToolCategory(toolName: string): ToolCategory {
  if (TOOL_CATEGORIES[toolName]) {
    return TOOL_CATEGORIES[toolName]
  }
  if (/^mcp__db__.+_query$/.test(toolName)) {
    return DB_QUERY_CATEGORY
  }
  return OTHER_CATEGORY
}

function getToolGroupLabel(messages: Message[]): string {
  const counts = new Map<string, { category: ToolCategory; count: number }>()
  const order: string[] = []

  for (const msg of messages) {
    const toolName = (msg.processed as ProcessedToolCall).toolName
    const category = getToolCategory(toolName)

    const existing = counts.get(category.key)
    if (existing) {
      existing.count++
    } else {
      counts.set(category.key, { category, count: 1 })
      order.push(category.key)
    }
  }

  // Format as "N reads, M writes" in order of first appearance
  return order.map(key => {
    const { category, count } = counts.get(key)!
    return `${count} ${count === 1 ? category.singular : category.plural}`
  }).join(", ")
}

interface Props {
  messages: Message[]
  isLoading: boolean
  outputsUrl?: string | null
  localPath?: string | null
}

export function CollapsedToolGroup({ messages, isLoading, outputsUrl, localPath }: Props) {
  const [expanded, setExpanded] = useState(false)

  const label = useMemo(() => getToolGroupLabel(messages), [messages])

  // Check if any tool in the group is still in progress
  const anyInProgress = messages.some(msg => {
    const processed = msg.processed as ProcessedToolCall
    return processed.result === undefined
  })

  const showLoadingState = anyInProgress && isLoading

  return (
    <MetaRow className="w-full">
      <div className="flex flex-col w-full">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`group cursor-pointer grid grid-cols-[auto_1fr] items-center gap-1 text-sm ${!expanded && !showLoadingState ? "hover:opacity-60 transition-opacity" : ""}`}
        >
          <div className="grid grid-cols-[auto_1fr] items-center gap-1.5">
            <div className="w-5 h-5 relative flex items-center justify-center">
              <ChevronRight
                className={`h-4.5 w-4.5 text-muted-icon transition-all duration-200 ${expanded ? "rotate-90" : ""}`}
              />
            </div>
            <MetaLabel className="text-left">
              <AnimatedShinyText animate={showLoadingState}>{label}</AnimatedShinyText>
            </MetaLabel>
          </div>
        </button>
        {expanded && (
          <div className="my-4 flex flex-col gap-3">
            {messages.map(msg => (
              <ToolCallMessage
                key={msg.id}
                message={msg.processed as ProcessedToolCall}
                isLoading={isLoading}
                outputsUrl={outputsUrl}
                localPath={localPath}
              />
            ))}
            {messages.length > 5 && (
              <button
                onClick={() => setExpanded(false)}
                className="cursor-pointer grid grid-cols-[auto_1fr] items-center gap-1 text-xs hover:opacity-80 transition-opacity"
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-1.5">
                  <div className="w-5 h-5 relative flex items-center justify-center">
                    <ChevronRight className="h-4.5 w-4.5 text-muted-icon -rotate-90" />
                  </div>
                  <MetaLabel className="text-left">Collapse</MetaLabel>
                </div>
              </button>
            )}
          </div>
        )}
      </div>
    </MetaRow>
  )
}
