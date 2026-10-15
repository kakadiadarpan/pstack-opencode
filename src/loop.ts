import type { Plugin } from "@opencode/plugin"

type Context = Plugin.Context
type Loop = { id: string; sessionID: string; prompt: string; every?: number; nextAt: number; runs: number }

const prefix = "loop/"
const timers = new Map<string, ReturnType<typeof setTimeout>>()

export function parseDuration(text: string): number | undefined {
  const match = text.trim().match(/^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d)$/i)
  if (!match) return undefined
  const unit = match[2]!.toLowerCase()[0] as "s" | "m" | "h" | "d"
  return Number(match[1]) * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]
}

const describe = (ms: number) =>
  ms % 3_600_000 === 0 ? `${ms / 3_600_000}h` : ms % 60_000 === 0 ? `${ms / 60_000}m` : `${Math.round(ms / 1000)}s`

const dynamicNote =
  "This is a dynamic /loop. When this turn ends without meeting the finish condition, call the `loop` tool with `after` set to when the result is next worth checking, and the same prompt. When the condition passes, do not re-arm it."

export function createLoops(ctx: Context) {
  async function fire(loop: Loop) {
    timers.delete(loop.id)
    const current = (await ctx.storage.get(prefix + loop.id)) as Loop | undefined
    if (!current) return
    await ctx.session.wait({ sessionID: loop.sessionID }).catch(() => undefined)
    const label = current.every ? `[loop ${loop.id}, every ${describe(current.every)}]` : `[loop ${loop.id}]`
    await ctx.session.prompt({ sessionID: loop.sessionID, text: `${label} ${current.prompt}` })
    if (!current.every) return ctx.storage.remove(prefix + loop.id)
    const next = { ...current, runs: current.runs + 1, nextAt: Date.now() + current.every }
    await ctx.storage.set(prefix + loop.id, next)
    arm(next)
  }

  function arm(loop: Loop) {
    clearTimeout(timers.get(loop.id))
    timers.set(
      loop.id,
      setTimeout(() => void fire(loop).catch(console.error), Math.max(0, loop.nextAt - Date.now())),
    )
  }

  async function list(sessionID?: string) {
    const { entries } = await ctx.storage.scan({ prefix, limit: 500 })
    return entries.map((e) => e.value as Loop).filter((l) => !sessionID || l.sessionID === sessionID)
  }

  async function schedule(sessionID: string, prompt: string, delay: number, every?: number) {
    const loop: Loop = { id: crypto.randomUUID().slice(0, 8), sessionID, prompt, every, nextAt: Date.now() + delay, runs: 0 }
    await ctx.storage.set(prefix + loop.id, loop)
    arm(loop)
    return loop
  }

  async function stop(sessionID: string, id?: string) {
    const stopped = (await list(sessionID)).filter((l) => !id || l.id === id)
    for (const loop of stopped) {
      clearTimeout(timers.get(loop.id))
      timers.delete(loop.id)
      await ctx.storage.remove(prefix + loop.id)
    }
    return stopped
  }

  const render = (loops: Loop[]) =>
    loops.length === 0
      ? "No loops armed in this session."
      : loops
          .map((l) => `${l.id}: ${l.every ? `every ${describe(l.every)}` : "once"}, next ${new Date(l.nextAt).toISOString()}, ${l.runs} runs: ${l.prompt}`)
          .join("\n")

  async function restore() {
    for (const loop of await list()) arm(loop)
  }

  const tool = {
    name: "loop",
    description: [
      "Arm, list, or stop wake-ups that re-prompt this session. This is what `/loop` does.",
      "`action: \"schedule\"` with `every` (for example \"30m\", \"1h\") re-sends `prompt` on that interval until stopped. With `after` instead, it fires once, which is how a dynamic loop re-arms itself.",
      "Each wake-up waits for the session to go idle, then arrives as a user message starting with `[loop <id>]`.",
      "Give the prompt a finish condition that can pass or fail, not a duration. Stop the loop once it passes.",
    ].join("\n"),
    input: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["schedule", "list", "stop"] },
        prompt: { type: "string", description: "What to re-check or do on each wake-up, with its finish condition" },
        every: { type: "string", description: "Repeat interval such as 90s, 30m, 1h" },
        after: { type: "string", description: "One-shot delay such as 10m" },
        id: { type: "string", description: "Loop to stop. Omit to stop every loop in this session" },
      },
      required: ["action"],
      additionalProperties: false,
    },
    options: { codemode: false },
    execute: async (input: unknown, context: { sessionID: string }) => {
      const args = input as { action: string; prompt?: string; every?: string; after?: string; id?: string }
      if (args.action === "list") return { content: render(await list(context.sessionID)) }
      if (args.action === "stop") {
        const stopped = await stop(context.sessionID, args.id)
        return { content: stopped.length ? `Stopped ${stopped.map((l) => l.id).join(", ")}.` : "No matching loop." }
      }
      if (!args.prompt) throw new Error("schedule needs a prompt")
      const every = args.every ? parseDuration(args.every) : undefined
      const after = args.after ? parseDuration(args.after) : undefined
      if (!every && !after) throw new Error("schedule needs `every` or `after` as a duration such as 30m")
      const loop = await schedule(context.sessionID, args.prompt, after ?? every!, every)
      return { content: `Armed loop ${loop.id}: ${every ? `every ${describe(every)}` : "once"}, first at ${new Date(loop.nextAt).toISOString()}.` }
    },
  }

  // `/loop [interval] <prompt>`, `/loop list`, `/loop stop [id]`.
  async function command(sessionID: string, text: string) {
    const [first = "", ...rest] = text.trim().split(/\s+/)
    if (first === "list") return ctx.session.synthetic({ sessionID, text: render(await list(sessionID)) })
    if (first === "stop") {
      const stopped = await stop(sessionID, rest[0])
      return ctx.session.synthetic({ sessionID, text: stopped.length ? `Stopped loop ${stopped.map((l) => l.id).join(", ")}.` : "No matching loop." })
    }
    const every = parseDuration(first)
    const prompt = (every ? rest.join(" ") : text).trim()
    if (!prompt) return ctx.session.synthetic({ sessionID, text: "Usage: /loop [interval] <prompt with a finish condition> | /loop list | /loop stop [id]" })
    if (every) {
      const loop = await schedule(sessionID, prompt, every, every)
      await ctx.session.prompt({ sessionID, text: `[loop ${loop.id}, every ${describe(every)}] ${prompt}` })
      return
    }
    await ctx.session.prompt({ sessionID, text: `${prompt}\n\n${dynamicNote}` })
  }

  return { tool, command, restore }
}
