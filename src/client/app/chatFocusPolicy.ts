export const FOCUS_FALLBACK_IGNORE_ATTRIBUTE = "data-focus-fallback-ignore"
export const ALLOW_FOCUS_RETAIN_ATTRIBUTE = "data-allow-focus-retain"
export const RESTORE_CHAT_INPUT_FOCUS_EVENT = "kanna:restore-chat-input-focus"
export const CHAT_INPUT_ATTRIBUTE = "data-chat-input"
export const CHAT_SELECTION_ZONE_ATTRIBUTE = "data-chat-selection-zone"

type ElementLike = {
  closest?: (selector: string) => Element | null
  matches?: (selector: string) => boolean
  getAttribute?: (name: string) => string | null
  tabIndex?: number
  isContentEditable?: boolean
}

type RootLike = {
  contains: (other: Node | null) => boolean
}

function hasAttributeInTree(element: Element | null, attribute: string) {
  return Boolean(element?.closest(`[${attribute}]`))
}

export function isTextEntryTarget(element: Element | null): boolean {
  const candidate = element as ElementLike | null
  if (!candidate?.matches) return false
  if (candidate.matches("input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset']), textarea, select")) {
    return true
  }
  if (candidate.isContentEditable) return true
  if (candidate.getAttribute?.("role") === "textbox") return true
  return hasAttributeInTree(element, ALLOW_FOCUS_RETAIN_ATTRIBUTE)
}

export function isFocusableTarget(element: Element | null): boolean {
  const candidate = element as ElementLike | null
  if (!candidate?.matches) return false
  if (isTextEntryTarget(element)) return true
  if ((candidate.tabIndex ?? -1) >= 0) return true
  if (candidate.matches("button, a[href], summary")) return true
  return hasAttributeInTree(element, ALLOW_FOCUS_RETAIN_ATTRIBUTE)
}

export function hasActiveFocusOverlay(document: Document): boolean {
  return Boolean(document.querySelector(`[${FOCUS_FALLBACK_IGNORE_ATTRIBUTE}][data-state='open']`))
}

export function isChatInputTarget(element: Element | null): boolean {
  return hasAttributeInTree(element, CHAT_INPUT_ATTRIBUTE)
}

export function isSelectionZoneTarget(element: Element | null): boolean {
  return hasAttributeInTree(element, CHAT_SELECTION_ZONE_ATTRIBUTE)
}

export function hasActiveTextSelection(selection: Selection | null | undefined): boolean {
  if (!selection) return false
  return !selection.isCollapsed && selection.toString().trim().length > 0
}

export function focusNextChatInput(current: HTMLTextAreaElement | null, document: Document) {
  if (!current) return false

  const chatInputs = Array.from(document.querySelectorAll<HTMLTextAreaElement>(`textarea[${CHAT_INPUT_ATTRIBUTE}]`))
    .filter((element) => !element.disabled)

  if (chatInputs.length === 0) return false

  const currentIndex = chatInputs.indexOf(current)
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % chatInputs.length : 0
  const nextInput = chatInputs[nextIndex]
  if (!nextInput) return false

  nextInput.focus({ preventScroll: true })
  return true
}

export function shouldFocusChatInputOnEscape(args: {
  activeElement: Element | null
  fallback: HTMLTextAreaElement | null
  hasActiveOverlay: boolean
  canCancel: boolean
  defaultPrevented: boolean
}): boolean {
  const { activeElement, fallback, hasActiveOverlay, canCancel, defaultPrevented } = args

  if (defaultPrevented) return false
  if (!fallback || fallback.disabled) return false
  if (hasActiveOverlay) return false
  if (activeElement === fallback) return false
  if (isChatInputTarget(activeElement)) return false
  if (canCancel) return false
  return true
}

export function shouldRestoreChatInputFocus(args: {
  activeElement: Element | null
  pointerStartTarget: Element | null
  pointerEndTarget: Element | null
  root: RootLike | null
  fallback: { disabled?: boolean } | null
  hasActiveOverlay: boolean
  hasActiveSelection: boolean
}): boolean {
  const { activeElement, pointerStartTarget, pointerEndTarget, root, fallback, hasActiveOverlay, hasActiveSelection } = args
  const interactionTarget = pointerEndTarget ?? pointerStartTarget

  if (!root || !fallback || fallback.disabled) return false
  if (!interactionTarget || !root.contains(interactionTarget)) return false
  if (hasAttributeInTree(interactionTarget, FOCUS_FALLBACK_IGNORE_ATTRIBUTE)) return false
  if (hasActiveOverlay) return false
  if (activeElement === fallback) return false
  if (hasAttributeInTree(activeElement, FOCUS_FALLBACK_IGNORE_ATTRIBUTE)) return false
  if (
    hasActiveSelection
    && (isSelectionZoneTarget(pointerStartTarget) || isSelectionZoneTarget(interactionTarget))
  ) {
    return false
  }
  if (isTextEntryTarget(activeElement)) return false
  if (activeElement && activeElement === interactionTarget) return true
  return !isFocusableTarget(activeElement)
}
