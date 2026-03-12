import { Loader2, X } from "lucide-react"
import type { SidebarChatRow } from "../../../../shared/types"
import { AnimatedShinyText } from "../../ui/animated-shiny-text"
import { Button } from "../../ui/button"
import { cn, normalizeChatId } from "../../../lib/utils"

const loadingStatuses = new Set(["starting", "running"])

interface Props {
  chat: SidebarChatRow
  activeChatId: string | null
  onSelectChat: (chatId: string) => void
  onDeleteChat: (chatId: string) => void
}

export function ChatRow({
  chat,
  activeChatId,
  onSelectChat,
  onDeleteChat,
}: Props) {
  return (
    <div
      key={chat._id}
      data-chat-id={normalizeChatId(chat.chatId)}
      className={cn(
        "group flex items-center gap-2 pl-2.5 pr-0.5 py-0.5 rounded-md cursor-pointer border-border/0 hover:border-border hover:bg-muted active:bg-muted border transition-colors",
        activeChatId === normalizeChatId(chat.chatId) ? "bg-muted border-border" : "border-border/0 dark:hover:border-slate-400/10 "
      )}
      onClick={() => onSelectChat(chat.chatId)}
    >
      {loadingStatuses.has(chat.status) ? (
        <Loader2 className="size-3.5 flex-shrink-0 animate-spin text-muted-foreground" />
      ) : chat.status === "waiting_for_user" ? (
        <div className="relative ">
          <div className=" rounded-full z-0 size-3.5 flex items-center justify-center ">
            <div className="absolute rounded-full z-0 size-2.5 bg-blue-400/80 animate-ping" />
            <div className=" rounded-full z-0 size-2.5 bg-blue-400 ring-2 ring-muted/20 dark:ring-muted/50" />
          </div>
        </div>
      ) : null}
      <span className="text-sm truncate flex-1 translate-y-[-0.5px]">
        {chat.status !== "idle" && chat.status !== "waiting_for_user" ? (
          <AnimatedShinyText
            animate={chat.status === "running"}
            shimmerWidth={Math.max(20, chat.title.length * 3)}
          >
            {chat.title}
          </AnimatedShinyText>
        ) : (
          chat.title
        )}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-100 md:opacity-0 md:group-hover:opacity-100 cursor-pointer rounded-sm hover:!bg-transparent"
        onClick={(event) => {
          event.stopPropagation()
          onDeleteChat(chat.chatId)
        }}
        title="Delete chat"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
