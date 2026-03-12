export const STORE_VERSION = 1 as const
export const PROTOCOL_VERSION = 1 as const

export type KannaStatus =
  | "idle"
  | "starting"
  | "running"
  | "waiting_for_user"
  | "failed"

export interface ProjectSummary {
  id: string
  localPath: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface SidebarChatRow {
  _id: string
  _creationTime: number
  chatId: string
  title: string
  status: KannaStatus
  localPath: string
  lastMessageAt?: number
  hasAutomation: boolean
}

export interface SidebarProjectGroup {
  groupKey: string
  localPath: string
  chats: SidebarChatRow[]
}

export interface SidebarData {
  projectGroups: SidebarProjectGroup[]
}

export interface LocalProjectSummary {
  localPath: string
  title: string
  source: "saved" | "discovered"
  lastOpenedAt?: number
  chatCount: number
}

export interface LocalProjectsSnapshot {
  machine: {
    id: "local"
    displayName: string
  }
  projects: LocalProjectSummary[]
}

export interface TranscriptEntry {
  _id: string
  messageId?: string
  message: string
  createdAt: number
  hidden?: boolean
}

export interface ChatRuntime {
  chatId: string
  projectId: string
  localPath: string
  title: string
  status: KannaStatus
  planMode: boolean
  resumeSessionId: string | null
}

export interface ChatSnapshot {
  runtime: ChatRuntime
  messages: TranscriptEntry[]
}

export interface KannaSnapshot {
  sidebar: SidebarData
  chat?: ChatSnapshot | null
}

export interface PendingToolSnapshot {
  toolUseId: string
  toolName: "AskUserQuestion" | "ExitPlanMode"
}
