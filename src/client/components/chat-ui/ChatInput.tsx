import { forwardRef, memo, useCallback, useEffect, useRef, useState } from "react"
import { ArrowUp } from "lucide-react"
import {
  type AgentProvider,
  type ClaudeReasoningEffort,
  type CodexReasoningEffort,
  type ModelOptions,
  type ProviderCatalogEntry,
} from "../../../shared/types"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { cn } from "../../lib/utils"
import { useIsStandalone } from "../../hooks/useIsStandalone"
import { useChatInputStore } from "../../stores/chatInputStore"
import { useChatPreferencesStore } from "../../stores/chatPreferencesStore"
import { CHAT_INPUT_ATTRIBUTE, focusNextChatInput } from "../../app/chatFocusPolicy"
import { ChatPreferenceControls } from "./ChatPreferenceControls"

interface Props {
  onSubmit: (
    value: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }
  ) => Promise<void>
  onCancel?: () => void
  disabled: boolean
  canCancel?: boolean
  chatId?: string | null
  activeProvider: AgentProvider | null
  availableProviders: ProviderCatalogEntry[]
}

const ChatInputInner = forwardRef<HTMLTextAreaElement, Props>(function ChatInput({
  onSubmit,
  onCancel,
  disabled,
  canCancel,
  chatId,
  activeProvider,
  availableProviders,
}, forwardedRef) {
  const { getDraft, setDraft, clearDraft } = useChatInputStore()
  const {
    composerState,
    setComposerModel,
    setComposerModelOptions,
    setComposerPlanMode,
    resetComposerFromProvider,
    initializeComposerForNewChat,
  } = useChatPreferencesStore()
  const [value, setValue] = useState(() => (chatId ? getDraft(chatId) : ""))
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isStandalone = useIsStandalone()

  const selectedProvider = activeProvider ?? composerState.provider
  const providerPrefs = composerState
  const providerLocked = activeProvider !== null
  const providerConfig = availableProviders.find((provider) => provider.id === selectedProvider) ?? availableProviders[0]
  const showPlanMode = providerConfig?.supportsPlanMode ?? false

  const autoResize = useCallback(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }, [])

  const setTextareaRefs = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node

    if (!forwardedRef) return
    if (typeof forwardedRef === "function") {
      forwardedRef(node)
      return
    }

    forwardedRef.current = node
  }, [forwardedRef])

  useEffect(() => {
    autoResize()
  }, [value, autoResize])

  useEffect(() => {
    window.addEventListener("resize", autoResize)
    return () => window.removeEventListener("resize", autoResize)
  }, [autoResize])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [chatId])

  useEffect(() => {
    if (chatId !== null) return
    if (activeProvider !== null) return
    initializeComposerForNewChat()
  }, [activeProvider, chatId, initializeComposerForNewChat])

  useEffect(() => {
    if (activeProvider === null) return
    if (composerState.provider === activeProvider) return
    resetComposerFromProvider(activeProvider)
  }, [activeProvider, composerState.provider, resetComposerFromProvider])

  function setReasoningEffort(reasoningEffort: string) {
    if (selectedProvider === "claude") {
      setComposerModelOptions({ reasoningEffort: reasoningEffort as ClaudeReasoningEffort })
      return
    }

    setComposerModelOptions({ reasoningEffort: reasoningEffort as CodexReasoningEffort })
  }

  async function handleSubmit() {
    if (!value.trim()) return
    const nextValue = value
    let modelOptions: ModelOptions
    if (providerPrefs.provider === "claude") {
      modelOptions = { claude: { ...providerPrefs.modelOptions } }
    } else {
      modelOptions = { codex: { ...providerPrefs.modelOptions } }
    }
    const submitOptions = {
      provider: selectedProvider,
      model: providerPrefs.model,
      modelOptions,
      planMode: showPlanMode ? providerPrefs.planMode : false,
    }

    setValue("")
    if (chatId) clearDraft(chatId)
    if (textareaRef.current) textareaRef.current.style.height = "auto"

    try {
      await onSubmit(nextValue, submitOptions)
    } catch (error) {
      console.error("[ChatInput] Submit failed:", error)
      setValue(nextValue)
      if (chatId) setDraft(chatId, nextValue)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault()
      focusNextChatInput(textareaRef.current, document)
      return
    }

    if (event.key === "Tab" && event.shiftKey && showPlanMode) {
      event.preventDefault()
      setComposerPlanMode(!providerPrefs.planMode)
      return
    }

    if (event.key === "Escape" && canCancel) {
      event.preventDefault()
      onCancel?.()
      return
    }

    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0
    if (event.key === "Enter" && !event.shiftKey && !canCancel && !isTouchDevice) {
      event.preventDefault()
      void handleSubmit()
    }
  }
  return (
    <div className={cn("p-3 pt-0 md:pb-2", isStandalone && "px-5 pb-5")}>
      <div className="flex items-end gap-2 max-w-[840px] mx-auto border dark:bg-card/40 backdrop-blur-lg border-border rounded-[29px] pr-1.5">
        <Textarea
          ref={setTextareaRefs}
          placeholder="Build something..."
          value={value}
          autoFocus
          {...{ [CHAT_INPUT_ATTRIBUTE]: "" }}
          rows={1}
          onChange={(event) => {
            setValue(event.target.value)
            if (chatId) setDraft(chatId, event.target.value)
            autoResize()
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="flex-1 text-base p-3 md:p-4 pl-4.5 md:pl-6 resize-none max-h-[200px] outline-none bg-transparent border-0 shadow-none"
        />
        <Button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault()
            if (canCancel) {
              onCancel?.()
            } else if (!disabled && value.trim()) {
              void handleSubmit()
            }
          }}
          disabled={!canCancel && (disabled || !value.trim())}
          size="icon"
          className="flex-shrink-0 bg-slate-600 text-white dark:bg-white dark:text-slate-900 rounded-full cursor-pointer h-10 w-10 md:h-11 md:w-11 mb-1 -mr-0.5 md:mr-0 md:mb-1.5 touch-manipulation disabled:bg-white/60 disabled:text-slate-700"
        >
          {canCancel ? (
            <div className="w-3 h-3 md:w-4 md:h-4 rounded-xs bg-current" />
          ) : (
            <ArrowUp className="h-5 w-5 md:h-6 md:w-6" />
          )}
        </Button>
      </div>

      <ChatPreferenceControls
        availableProviders={availableProviders}
        selectedProvider={selectedProvider}
        providerLocked={providerLocked}
        model={providerPrefs.model}
        modelOptions={providerPrefs.modelOptions}
        onProviderChange={(provider) => {
          if (providerLocked) return
          resetComposerFromProvider(provider)
        }}
        onModelChange={(_, model) => setComposerModel(model)}
        onClaudeReasoningEffortChange={(effort) => setReasoningEffort(effort)}
        onCodexReasoningEffortChange={(effort) => setReasoningEffort(effort)}
        onCodexFastModeChange={(fastMode) => setComposerModelOptions({ fastMode })}
        planMode={providerPrefs.planMode}
        onPlanModeChange={(planMode) => setComposerPlanMode(planMode)}
        includePlanMode={showPlanMode}
        className="max-w-[840px] mx-auto mt-2 animate-fade-in"
      />
    </div>
  )
})

export const ChatInput = memo(ChatInputInner)
