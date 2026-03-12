import type { ClientCommand, ClientEnvelope, ServerEnvelope, SubscriptionTopic } from "../../shared/protocol"
import { LOG_PREFIX } from "../../shared/branding"

type SnapshotListener<T> = (value: T) => void
export type SocketStatus = "connecting" | "connected" | "disconnected"
type StatusListener = (status: SocketStatus) => void

interface SubscriptionEntry<T> {
  topic: SubscriptionTopic
  listener: SnapshotListener<T>
}

export class KannaSocket {
  private readonly url: string
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private reconnectDelayMs = 750
  private readonly subscriptions = new Map<string, SubscriptionEntry<unknown>>()
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()
  private readonly outboundQueue: ClientEnvelope[] = []
  private readonly statusListeners = new Set<StatusListener>()

  constructor(url: string) {
    this.url = url
    this.connect()
  }

  dispose() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Socket disposed"))
    }
    this.pending.clear()
  }

  onStatus(listener: StatusListener) {
    this.statusListeners.add(listener)
    listener(this.getStatus())
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  subscribe<T>(topic: SubscriptionTopic, listener: SnapshotListener<T>) {
    const id = crypto.randomUUID()
    this.subscriptions.set(id, { topic, listener: listener as SnapshotListener<unknown> })
    this.enqueue({ v: 1, type: "subscribe", id, topic })
    return () => {
      this.subscriptions.delete(id)
      this.enqueue({ v: 1, type: "unsubscribe", id })
    }
  }

  command<TResult = unknown>(command: ClientCommand) {
    const id = crypto.randomUUID()
    const envelope: ClientEnvelope = { v: 1, type: "command", id, command }
    return new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.enqueue(envelope)
    })
  }

  private connect() {
    this.emitStatus("connecting")
    this.ws = new WebSocket(this.url)

    this.ws.addEventListener("open", () => {
      this.reconnectDelayMs = 750
      this.emitStatus("connected")
      for (const [id, subscription] of this.subscriptions.entries()) {
        this.sendNow({ v: 1, type: "subscribe", id, topic: subscription.topic })
      }
      while (this.outboundQueue.length > 0) {
        const envelope = this.outboundQueue.shift()
        if (envelope) {
          this.sendNow(envelope)
        }
      }
    })

    this.ws.addEventListener("message", (event) => {
      let payload: ServerEnvelope
      try {
        payload = JSON.parse(String(event.data)) as ServerEnvelope
      } catch {
        return
      }

      if (payload.type === "snapshot") {
        const subscription = this.subscriptions.get(payload.id)
        subscription?.listener(payload.snapshot.data)
        return
      }

      if (payload.type === "ack") {
        const pending = this.pending.get(payload.id)
        if (!pending) return
        this.pending.delete(payload.id)
        pending.resolve(payload.result)
        return
      }

      if (payload.type === "error") {
        if (!payload.id) {
          console.error(LOG_PREFIX, payload.message)
          return
        }
        const pending = this.pending.get(payload.id)
        if (!pending) return
        this.pending.delete(payload.id)
        pending.reject(new Error(payload.message))
      }
    })

    this.ws.addEventListener("close", () => {
      this.emitStatus("disconnected")
      for (const pending of this.pending.values()) {
        pending.reject(new Error("Disconnected"))
      }
      this.pending.clear()
      this.scheduleReconnect()
    })
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 5_000)
    }, this.reconnectDelayMs)
  }

  private getStatus(): SocketStatus {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return "connected"
    }
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      return "connecting"
    }
    return "disconnected"
  }

  private emitStatus(status: SocketStatus) {
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }

  private enqueue(envelope: ClientEnvelope) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendNow(envelope)
      return
    }
    this.outboundQueue.push(envelope)
  }

  private sendNow(envelope: ClientEnvelope) {
    this.ws?.send(JSON.stringify(envelope))
  }
}
