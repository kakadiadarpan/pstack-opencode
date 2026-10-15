import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"

export const distDir = join(import.meta.dir, "..", "dist")

type SkillEntry = { id: string; name: string; description?: string; autoinvoke?: boolean; file: string }
type AgentEntry = { id: string; name?: string; description?: string; mode?: "primary" | "subagent" | "all"; color?: string; file: string }
type Manifest = { upstream: string; skills: SkillEntry[]; agents: AgentEntry[] }

export const manifest: Manifest = JSON.parse(readFileSync(join(distDir, "manifest.json"), "utf8"))

export const body = (file: string) => readFileSync(join(distDir, file), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim()

export const potetoModeFile = join(distDir, "skills/poteto-mode/SKILL.md")

// Agent prompts are appended to the system prompt by the context hook, so the provider's base
// prompt and OpenCode's tool guidance stay in place.
export function agentPrompt(agent: AgentEntry) {
  return body(agent.file)
    .replaceAll("{{POTETO_MODE_SKILL}}", potetoModeFile)
    .replaceAll("{{POTETO_MODE_BODY}}", body("skills/poteto-mode/SKILL.md"))
}

export const skillDir = (skill: SkillEntry) => dirname(join(distDir, skill.file))
