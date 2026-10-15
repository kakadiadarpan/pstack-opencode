import { existsSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
export const globalSheetPath = join(configHome, "opencode", "pstack", "models.md")
const aliases = ["code-default", "judgment-default"] as const

// Upstream's role table (setup-pstack step 5), with Cursor slugs replaced by the two aliases.
const defaults: [role: string, value: string][] = [
  ["feature, refactoring", "code-default"],
  ["bug-fix", "code-default"],
  ["perf-issue", "code-default"],
  ["hillclimb", "code-default"],
  ["judgment and prose", "judgment-default"],
  ["hardest tasks", "judgment-default"],
  ["how explorer", "code-default"],
  ["how explainer", "judgment-default"],
  ["why investigators", "code-default"],
  ["why synthesizer", "judgment-default"],
  ["reflect tooling", "code-default"],
  ["reflect judgment, divergent, synthesizer", "judgment-default"],
  ["arena runners", "judgment-default, code-default"],
  ["arena cross-judge pool", "judgment-default, code-default"],
  ["swarm workers", "code-default"],
  ["architect runners", "judgment-default, code-default"],
  ["interrogate reviewers", "judgment-default, code-default"],
]

type Line = { role: string; value: string }
const cache = new Map<string, { mtime: number; lines: Line[]; comments: string[] }>()

function load(path: string) {
  if (!existsSync(path)) return undefined
  const mtime = statSync(path).mtimeMs
  const hit = cache.get(path)
  if (hit?.mtime === mtime) return hit
  const lines: Line[] = []
  const comments: string[] = []
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const text = raw.trim()
    if (!text || text.startsWith("```")) continue
    if (text.startsWith("#")) {
      comments.push(text)
      continue
    }
    const at = text.indexOf(":")
    if (at > 0) lines.push({ role: text.slice(0, at).trim(), value: text.slice(at + 1).trim() })
  }
  const entry = { mtime, lines, comments }
  cache.set(path, entry)
  return entry
}

// Project lines replace global lines role by role.
export function renderSheet(projectDir: string | undefined) {
  const global = load(globalSheetPath)
  const projectPath = projectDir ? join(projectDir, ".opencode", "pstack", "models.md") : undefined
  const project = projectPath ? load(projectPath) : undefined
  if (!global && !project) {
    return [
      "No pstack model sheet is configured, so /setup-pstack has not run.",
      "Until it does, every role, `code-default`, and `judgment-default` mean `inherit-parent`: omit the subagent `model` so the subagent runs on this session's model.",
    ].join("\n")
  }
  const merged = new Map<string, string>(defaults)
  for (const line of global?.lines ?? []) merged.set(line.role, line.value)
  for (const line of project?.lines ?? []) merged.set(line.role, line.value)
  const budget = [...(project?.comments ?? []), ...(global?.comments ?? [])].find((c) => /^#\s*budget:/i.test(c))
  const resolve = (value: string) =>
    value
      .split(",")
      .map((v) => v.trim())
      .map((v) => (aliases.includes(v as (typeof aliases)[number]) ? (merged.get(v) ?? "inherit-parent") : v))
      .join(", ")
  const rows = [...merged].map(([role, value]) => {
    const resolved = resolve(value)
    return resolved === value ? `${role}: ${value}` : `${role}: ${value} (= ${resolved})`
  })
  return [
    `Source: ${[global && globalSheetPath, project && projectPath].filter(Boolean).join(" + ")}`,
    budget ?? "",
    ...rows,
    "`inherit-parent` or `auto` means omit the subagent `model`. A panel role runs one subagent per listed entry.",
  ]
    .filter(Boolean)
    .join("\n")
}
