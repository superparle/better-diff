import { type ReactNode } from "react"
import { ChevronRight, Folder, FolderOpen, Loader2, SquarePen } from "lucide-react"
import { Button } from "../../ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip"
import type { SidebarChatRow, SidebarProjectGroup } from "../../../../shared/types"
import { APP_NAME } from "../../../../shared/branding"
import { getPathBasename } from "../../../lib/formatters"
import { cn } from "../../../lib/utils"
import { ProjectSectionMenu } from "./Menus"

interface Props {
  projectGroups: SidebarProjectGroup[]
  collapsedSections: Set<string>
  expandedGroups: Set<string>
  onToggleSection: (key: string) => void
  onToggleExpandedGroup: (key: string) => void
  renderChatRow: (chat: SidebarChatRow) => ReactNode
  chatsPerProject: number
  onNewLocalChat?: (localPath: string) => void
  onRemoveProject?: (projectId: string) => void
  isConnected?: boolean
  startingLocalPath?: string | null
}

export function LocalProjectsSection({
  projectGroups,
  collapsedSections,
  expandedGroups,
  onToggleSection,
  onToggleExpandedGroup,
  renderChatRow,
  chatsPerProject,
  onNewLocalChat,
  onRemoveProject,
  isConnected,
  startingLocalPath,
}: Props) {
  return (
    <>
      {projectGroups.map(({ groupKey, localPath, chats: pathChats }) => {
        const isExpanded = expandedGroups.has(groupKey)
        const displayChats = isExpanded ? pathChats : pathChats.slice(0, chatsPerProject)
        const hasMore = pathChats.length > chatsPerProject

        return (
          <div key={groupKey} className="group/section">
            <div
              className="sticky top-0 bg-background dark:bg-card z-10 relative pl-2.5 pr-3 py-2 pt-3 cursor-pointer flex items-center justify-between"
              onClick={() => onToggleSection(groupKey)}
            >
              <div className="flex items-center gap-2">
                {collapsedSections.has(groupKey) ? <Folder className="translate-y-[1px] size-3.5 shrink-0 text-slate-400 dark:text-slate-500" /> : <FolderOpen className="translate-y-[1px] size-3.5 shrink-0 text-slate-400 dark:text-slate-500" />}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate max-w-[150px] whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                      {getPathBasename(localPath)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={4}>
                    {localPath}
                  </TooltipContent>
                </Tooltip>
                <ChevronRight
                  className={cn(
                    "size-3.5 translate-y-[1px] text-slate-400 transition-all duration-200",
                    collapsedSections.has(groupKey) ? "opacity-100" : "rotate-90 opacity-0 group-hover/section:opacity-100"
                  )}
                />
              </div>
              {onRemoveProject ? (
                <ProjectSectionMenu
                  onRemove={() => onRemoveProject(groupKey)}
                />
              ) : null}
              {onNewLocalChat && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-5.5 w-5.5 absolute right-0 !rounded opacity-100 md:opacity-0 md:group-hover/section:opacity-100",
                        (!isConnected || startingLocalPath === localPath) && "opacity-50 cursor-not-allowed"
                      )}
                      disabled={!isConnected || startingLocalPath === localPath}
                      onClick={(event) => {
                        event.stopPropagation()
                        onNewLocalChat(localPath)
                      }}
                    >
                      {startingLocalPath === localPath ? (
                        <Loader2 className="size-4 text-slate-500 dark:text-slate-400 animate-spin" />
                      ) : (
                        <SquarePen className="size-3.5 text-slate-500 dark:text-slate-400" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={4}>
                    {!isConnected ? `Start ${APP_NAME} to connect` : "New chat"}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {!collapsedSections.has(groupKey) && (
              <div className="space-y-[2px] mb-2 ">
                {displayChats.map(renderChatRow)}
                {hasMore && (
                  <button
                    onClick={() => onToggleExpandedGroup(groupKey)}
                    className="pl-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? "Show less" : `Show more (${pathChats.length - chatsPerProject})`}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
