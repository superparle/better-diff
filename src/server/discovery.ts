import { existsSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

export interface DiscoveredProject {
  localPath: string
  title: string
  modifiedAt: number
}

function resolveEncodedClaudePath(folderName: string) {
  const segments = folderName.replace(/^-/, "").split("-").filter(Boolean)
  let currentPath = ""
  let remainingSegments = [...segments]

  while (remainingSegments.length > 0) {
    let found = false

    for (let index = remainingSegments.length; index >= 1; index -= 1) {
      const segment = remainingSegments.slice(0, index).join("-")
      const candidate = `${currentPath}/${segment}`

      if (existsSync(candidate)) {
        currentPath = candidate
        remainingSegments = remainingSegments.slice(index)
        found = true
        break
      }
    }

    if (!found) {
      const [head, ...tail] = remainingSegments
      currentPath = `${currentPath}/${head}`
      remainingSegments = tail
    }
  }

  return currentPath || "/"
}

export function discoverClaudeProjects(homeDir: string = homedir()): DiscoveredProject[] {
  const projectsDir = path.join(homeDir, ".claude", "projects")
  if (!existsSync(projectsDir)) {
    return []
  }

  const entries = readdirSync(projectsDir, { withFileTypes: true })
  const projects: DiscoveredProject[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const resolvedPath = resolveEncodedClaudePath(entry.name)
    if (!existsSync(resolvedPath)) continue

    const stat = statSync(path.join(projectsDir, entry.name))
    projects.push({
      localPath: resolvedPath,
      title: path.basename(resolvedPath) || resolvedPath,
      modifiedAt: stat.mtimeMs,
    })
  }

  return projects.sort((a, b) => b.modifiedAt - a.modifiedAt)
}
