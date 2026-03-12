import { appendFile, mkdir } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { getDataDir, LOG_PREFIX } from "../shared/branding"
import type { TranscriptEntry } from "../shared/types"
import { STORE_VERSION } from "../shared/types"
import {
  type ChatEvent,
  type MessageEvent,
  type ProjectEvent,
  type SnapshotFile,
  type StoreEvent,
  type StoreState,
  type TurnEvent,
  cloneTranscriptEntries,
  createEmptyState,
} from "./events"
import { resolveLocalPath } from "./paths"

const DATA_DIR = getDataDir(homedir())
const SNAPSHOT_PATH = path.join(DATA_DIR, "snapshot.json")
const PROJECTS_LOG = path.join(DATA_DIR, "projects.jsonl")
const CHATS_LOG = path.join(DATA_DIR, "chats.jsonl")
const MESSAGES_LOG = path.join(DATA_DIR, "messages.jsonl")
const TURNS_LOG = path.join(DATA_DIR, "turns.jsonl")
const COMPACTION_THRESHOLD_BYTES = 2 * 1024 * 1024

export class EventStore {
  readonly dataDir = DATA_DIR
  readonly state: StoreState = createEmptyState()
  private writeChain = Promise.resolve()

  async initialize() {
    await mkdir(DATA_DIR, { recursive: true })
    await this.ensureFile(PROJECTS_LOG)
    await this.ensureFile(CHATS_LOG)
    await this.ensureFile(MESSAGES_LOG)
    await this.ensureFile(TURNS_LOG)
    await this.loadSnapshot()
    await this.replayLogs()
    if (await this.shouldCompact()) {
      await this.compact()
    }
  }

  private async ensureFile(filePath: string) {
    const file = Bun.file(filePath)
    if (!(await file.exists())) {
      await Bun.write(filePath, "")
    }
  }

  private async loadSnapshot() {
    const file = Bun.file(SNAPSHOT_PATH)
    if (!(await file.exists())) return

    try {
      const parsed = (await file.json()) as SnapshotFile
      if (parsed.v !== STORE_VERSION) {
        throw new Error(`Unsupported snapshot version ${String(parsed.v)}`)
      }
      for (const project of parsed.projects) {
        this.state.projectsById.set(project.id, { ...project })
        this.state.projectIdsByPath.set(project.localPath, project.id)
      }
      for (const chat of parsed.chats) {
        this.state.chatsById.set(chat.id, { ...chat })
      }
      for (const messageSet of parsed.messages) {
        this.state.messagesByChatId.set(messageSet.chatId, cloneTranscriptEntries(messageSet.entries))
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to load snapshot, rebuilding from logs:`, error)
      this.resetState()
    }
  }

  private resetState() {
    this.state.projectsById.clear()
    this.state.projectIdsByPath.clear()
    this.state.chatsById.clear()
    this.state.messagesByChatId.clear()
  }

  private async replayLogs() {
    await this.replayLog<ProjectEvent>(PROJECTS_LOG)
    await this.replayLog<ChatEvent>(CHATS_LOG)
    await this.replayLog<MessageEvent>(MESSAGES_LOG)
    await this.replayLog<TurnEvent>(TURNS_LOG)
  }

  private async replayLog<TEvent extends StoreEvent>(filePath: string) {
    const file = Bun.file(filePath)
    if (!(await file.exists())) return
    const text = await file.text()
    if (!text.trim()) return

    const lines = text.split("\n")
    let lastNonEmpty = -1
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (lines[index].trim()) {
        lastNonEmpty = index
        break
      }
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim()
      if (!line) continue
      try {
        const event = JSON.parse(line) as TEvent
        this.applyEvent(event)
      } catch (error) {
        if (index === lastNonEmpty) {
          console.warn(`${LOG_PREFIX} Ignoring corrupt trailing line in ${path.basename(filePath)}`)
          return
        }
        throw error
      }
    }
  }

  private applyEvent(event: StoreEvent) {
    switch (event.type) {
      case "project_opened": {
        const localPath = resolveLocalPath(event.localPath)
        const project = {
          id: event.projectId,
          localPath,
          title: event.title,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        }
        this.state.projectsById.set(project.id, project)
        this.state.projectIdsByPath.set(localPath, project.id)
        break
      }
      case "project_removed": {
        const project = this.state.projectsById.get(event.projectId)
        if (!project) break
        project.deletedAt = event.timestamp
        project.updatedAt = event.timestamp
        this.state.projectIdsByPath.delete(project.localPath)
        break
      }
      case "chat_created": {
        const chat = {
          id: event.chatId,
          projectId: event.projectId,
          title: event.title,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
          planMode: false,
          resumeSessionId: null,
          lastTurnOutcome: null,
        }
        this.state.chatsById.set(chat.id, chat)
        break
      }
      case "chat_renamed": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.title = event.title
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_deleted": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.deletedAt = event.timestamp
        chat.updatedAt = event.timestamp
        break
      }
      case "chat_plan_mode_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.planMode = event.planMode
        chat.updatedAt = event.timestamp
        break
      }
      case "message_appended": {
        const chat = this.state.chatsById.get(event.chatId)
        if (chat) {
          // Only update lastMessageAt for user-sent messages so the sidebar
          // sorts by "last sent" rather than "last received".
          try {
            const parsed = JSON.parse(event.entry.message)
            if (parsed.type === "user_prompt") {
              chat.lastMessageAt = event.entry.createdAt
            }
          } catch {
            // non-JSON entry, skip
          }
          chat.updatedAt = Math.max(chat.updatedAt, event.entry.createdAt)
        }
        const existing = this.state.messagesByChatId.get(event.chatId) ?? []
        existing.push({ ...event.entry })
        this.state.messagesByChatId.set(event.chatId, existing)
        break
      }
      case "turn_started": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.updatedAt = event.timestamp
        break
      }
      case "turn_finished": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.updatedAt = event.timestamp
        chat.lastTurnOutcome = "success"
        break
      }
      case "turn_failed": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.updatedAt = event.timestamp
        chat.lastTurnOutcome = "failed"
        break
      }
      case "turn_cancelled": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.updatedAt = event.timestamp
        chat.lastTurnOutcome = "cancelled"
        break
      }
      case "resume_session_set": {
        const chat = this.state.chatsById.get(event.chatId)
        if (!chat) break
        chat.resumeSessionId = event.sessionId
        chat.updatedAt = event.timestamp
        break
      }
    }
  }

  private append<TEvent extends StoreEvent>(filePath: string, event: TEvent) {
    const payload = `${JSON.stringify(event)}\n`
    this.writeChain = this.writeChain.then(async () => {
      await appendFile(filePath, payload, "utf8")
      this.applyEvent(event)
    })
    return this.writeChain
  }

  async openProject(localPath: string, title?: string) {
    const normalized = resolveLocalPath(localPath)
    const existingId = this.state.projectIdsByPath.get(normalized)
    if (existingId) {
      const existing = this.state.projectsById.get(existingId)
      if (existing && !existing.deletedAt) {
        return existing
      }
    }

    const projectId = crypto.randomUUID()
    const event: ProjectEvent = {
      v: STORE_VERSION,
      type: "project_opened",
      timestamp: Date.now(),
      projectId,
      localPath: normalized,
      title: title?.trim() || path.basename(normalized) || normalized,
    }
    await this.append(PROJECTS_LOG, event)
    return this.state.projectsById.get(projectId)!
  }

  async removeProject(projectId: string) {
    const project = this.getProject(projectId)
    if (!project) {
      throw new Error("Project not found")
    }

    const event: ProjectEvent = {
      v: STORE_VERSION,
      type: "project_removed",
      timestamp: Date.now(),
      projectId,
    }
    await this.append(PROJECTS_LOG, event)
  }

  async createChat(projectId: string) {
    const project = this.state.projectsById.get(projectId)
    if (!project || project.deletedAt) {
      throw new Error("Project not found")
    }
    const chatId = crypto.randomUUID()
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_created",
      timestamp: Date.now(),
      chatId,
      projectId,
      title: "New Chat",
    }
    await this.append(CHATS_LOG, event)
    return this.state.chatsById.get(chatId)!
  }

  async renameChat(chatId: string, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    const chat = this.requireChat(chatId)
    if (chat.title === trimmed) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_renamed",
      timestamp: Date.now(),
      chatId,
      title: trimmed,
    }
    await this.append(CHATS_LOG, event)
  }

  async deleteChat(chatId: string) {
    this.requireChat(chatId)
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_deleted",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(CHATS_LOG, event)
  }

  async setPlanMode(chatId: string, planMode: boolean) {
    const chat = this.requireChat(chatId)
    if (chat.planMode === planMode) return
    const event: ChatEvent = {
      v: STORE_VERSION,
      type: "chat_plan_mode_set",
      timestamp: Date.now(),
      chatId,
      planMode,
    }
    await this.append(CHATS_LOG, event)
  }

  async appendMessage(chatId: string, entry: TranscriptEntry) {
    this.requireChat(chatId)
    const event: MessageEvent = {
      v: STORE_VERSION,
      type: "message_appended",
      timestamp: Date.now(),
      chatId,
      entry,
    }
    await this.append(MESSAGES_LOG, event)
  }

  async recordTurnStarted(chatId: string) {
    this.requireChat(chatId)
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "turn_started",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(TURNS_LOG, event)
  }

  async recordTurnFinished(chatId: string) {
    this.requireChat(chatId)
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "turn_finished",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(TURNS_LOG, event)
  }

  async recordTurnFailed(chatId: string, error: string) {
    this.requireChat(chatId)
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "turn_failed",
      timestamp: Date.now(),
      chatId,
      error,
    }
    await this.append(TURNS_LOG, event)
  }

  async recordTurnCancelled(chatId: string) {
    this.requireChat(chatId)
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "turn_cancelled",
      timestamp: Date.now(),
      chatId,
    }
    await this.append(TURNS_LOG, event)
  }

  async setResumeSession(chatId: string, sessionId: string | null) {
    const chat = this.requireChat(chatId)
    if (chat.resumeSessionId === sessionId) return
    const event: TurnEvent = {
      v: STORE_VERSION,
      type: "resume_session_set",
      timestamp: Date.now(),
      chatId,
      sessionId,
    }
    await this.append(TURNS_LOG, event)
  }

  getProject(projectId: string) {
    const project = this.state.projectsById.get(projectId)
    if (!project || project.deletedAt) return null
    return project
  }

  requireChat(chatId: string) {
    const chat = this.state.chatsById.get(chatId)
    if (!chat || chat.deletedAt) {
      throw new Error("Chat not found")
    }
    return chat
  }

  getChat(chatId: string) {
    const chat = this.state.chatsById.get(chatId)
    if (!chat || chat.deletedAt) return null
    return chat
  }

  getMessages(chatId: string) {
    return cloneTranscriptEntries(this.state.messagesByChatId.get(chatId) ?? [])
  }

  listProjects() {
    return [...this.state.projectsById.values()].filter((project) => !project.deletedAt)
  }

  listChatsByProject(projectId: string) {
    return [...this.state.chatsById.values()]
      .filter((chat) => chat.projectId === projectId && !chat.deletedAt)
      .sort((a, b) => (b.lastMessageAt ?? b.updatedAt) - (a.lastMessageAt ?? a.updatedAt))
  }

  getChatCount(projectId: string) {
    return this.listChatsByProject(projectId).length
  }

  async compact() {
    const snapshot: SnapshotFile = {
      v: STORE_VERSION,
      generatedAt: Date.now(),
      projects: this.listProjects().map((project) => ({ ...project })),
      chats: [...this.state.chatsById.values()]
        .filter((chat) => !chat.deletedAt)
        .map((chat) => ({ ...chat })),
      messages: [...this.state.messagesByChatId.entries()].map(([chatId, entries]) => ({
        chatId,
        entries: cloneTranscriptEntries(entries),
      })),
    }
    await Bun.write(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2))
    await Bun.write(PROJECTS_LOG, "")
    await Bun.write(CHATS_LOG, "")
    await Bun.write(MESSAGES_LOG, "")
    await Bun.write(TURNS_LOG, "")
  }

  private async shouldCompact() {
    const files = [PROJECTS_LOG, CHATS_LOG, MESSAGES_LOG, TURNS_LOG]
    let total = 0
    for (const filePath of files) {
      total += Bun.file(filePath).size
    }
    return total >= COMPACTION_THRESHOLD_BYTES
  }
}
