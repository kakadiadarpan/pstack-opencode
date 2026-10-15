import type { Plugin } from "@opencode/plugin"
import { mkdir, stat, utimes, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join } from "node:path"

type Context = Plugin.Context
type SessionRow = { id: string; title?: string; parentID?: string; projectID: string; time: { created: number; updated: number }; location?: { directory: string } }

const dataHome = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
export const transcriptsRoot = join(dataHome, "opencode", "pstack", "transcripts")

const opencodeBin = basename(process.execPath).startsWith("opencode") ? process.execPath : "opencode"

async function api(path: string): Promise<unknown> {
  const proc = Bun.spawn([opencodeBin, "api", "get", path], { stdout: "pipe", stderr: "pipe" })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  if (code !== 0) throw new Error(`opencode api get ${path} failed: ${err.trim() || code}`)
  return JSON.parse(out)
}

async function sessions(query: Record<string, string>) {
  const out = (await api(`/api/session?${new URLSearchParams(query)}`)) as { data: SessionRow[] }
  return out.data
}

type Part = { type: string; text?: string; name?: string; state?: { input?: unknown } }
type Message = { type: string; text?: string; content?: Part[] }

// Cursor's transcript layout, so upstream skills that read `message.content[0].text` keep working.
function toJsonl(messages: readonly Message[]) {
  const lines: string[] = []
  for (const m of messages) {
    if (m.type === "user" && m.text) lines.push(JSON.stringify({ role: "user", message: { content: [{ type: "text", text: m.text }] } }))
    if (m.type !== "assistant" || !m.content) continue
    const content = m.content.flatMap((p): unknown[] =>
      p.type === "text" && p.text ? [{ type: "text", text: p.text }] : p.type === "tool" ? [{ type: "tool_use", name: p.name, input: p.state?.input }] : [],
    )
    if (content.length) lines.push(JSON.stringify({ role: "assistant", message: { content } }))
  }
  return lines.join("\n") + "\n"
}

async function exportSession(ctx: Context, session: SessionRow, file: string) {
  const fresh = await stat(file).then((s) => s.mtimeMs >= session.time.updated - 1000, () => false)
  if (!fresh) {
    const messages = (await ctx.session.context({ sessionID: session.id })) as unknown as Message[]
    await writeFile(file, toJsonl(messages))
  }
  const when = new Date(session.time.updated)
  await utimes(file, when, when)
}

export const transcriptsTool = (ctx: Context) => ({
  name: "transcripts",
  description: [
    "Export OpenCode sessions as JSONL transcripts and return the directory, plus this session's ID.",
    "Layout: <dir>/<session ID>/<session ID>.jsonl, with subagent sessions at <dir>/<session ID>/subagents/<child ID>.jsonl. Each line is {role, message: {content: [...]}}. File modification times match each session's last update, so `ls -t` orders them.",
    "Default scope is this session's project. Use scope \"all\" only when the user asks about other projects, because it reads private sessions from unrelated work.",
  ].join("\n"),
  input: {
    type: "object",
    properties: {
      scope: { type: "string", enum: ["project", "all"] },
      limit: { type: "number", description: "Most recent top-level sessions to export (default 50)" },
      days: { type: "number", description: "Only sessions updated in the last N days" },
    },
    additionalProperties: false,
  },
  options: { codemode: false },
  execute: async (input: unknown, context: { sessionID: string }) => {
    const args = input as { scope?: "project" | "all"; limit?: number; days?: number }
    const self = (await ctx.session.get({ sessionID: context.sessionID })) as unknown as SessionRow
    const all = args.scope === "all"
    const query: Record<string, string> = { limit: String(args.limit ?? 50), parentID: "null" }
    if (!all) query.project = self.projectID
    const cutoff = args.days ? Date.now() - args.days * 86_400_000 : 0
    const tops = (await sessions(query)).filter((s) => s.time.updated >= cutoff)
    const dir = all ? join(transcriptsRoot, "all") : join(transcriptsRoot, self.projectID)
    let count = 0
    const skipped: string[] = []
    const save = (session: SessionRow, file: string) =>
      exportSession(ctx, session, file).then(
        () => count++,
        (error) => skipped.push(`${session.id}: ${error instanceof Error ? error.message : String(error)}`),
      )
    for (const top of tops) {
      const base = join(dir, top.id)
      await mkdir(join(base, "subagents"), { recursive: true })
      await save(top, join(base, `${top.id}.jsonl`))
      const queue = [top.id]
      while (queue.length) {
        for (const child of await sessions({ parentID: queue.shift()!, limit: "200" })) {
          await save(child, join(base, "subagents", `${child.id}.jsonl`))
          queue.push(child.id)
        }
      }
    }
    const root = self.parentID ? "(this is a subagent session; its parent owns the top-level transcript)" : ""
    return {
      content: [
        `Transcripts directory: ${dir}`,
        `This session: ${context.sessionID} ${root}`.trim(),
        `Exported ${count} session(s) from ${tops.length} top-level session(s).`,
        ...(skipped.length ? [`Skipped ${skipped.length} unreadable session(s):`, ...skipped.map((s) => `- ${s}`)] : []),
      ].join("\n"),
      metadata: { dir, sessionID: context.sessionID },
    }
  },
})
