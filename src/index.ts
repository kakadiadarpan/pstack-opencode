import { Agent, Plugin, Skill } from "@opencode/plugin"
import { homedir } from "node:os"
import { join } from "node:path"
import { agentPrompt, body, distDir, manifest } from "./assets.ts"
import { createLoops } from "./loop.ts"
import { renderSheet } from "./sheet.ts"
import { readTodos, renderTodos, todoTool } from "./todo.ts"
import { transcriptsTool } from "./transcripts.ts"

const routing = [
  "Route rigorous work through pstack. Before starting a task that touches more than one file, changes a signature other files call, involves a design or architecture choice, or concerns a bug with an unknown cause or a performance issue, load the `poteto-mode` skill with the skill tool and follow it. Smaller tasks proceed directly. Explicit user instructions win.",
].join("\n")

const dataHome = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")

const runtime = (sessionID: string, store: string) =>
  [
    "pstack for OpenCode is installed. When a pstack skill runs, these host facts replace its Cursor defaults:",
    '- Subagents use the `subagent` tool. `agent: "poteto-agent"` for playbook delegates. `agent: "general"` for full-tool helpers that need MCP (it cannot spawn or ask questions). `agent: "explore"` for read-only work (no edits, no MCP). `agent: "comment-sicko"` for /no-comments. `background: true` returns at once and you are notified when the child finishes.',
    "- A role's model from the pstack model sheet below counts as the user explicitly asking for that model, so pass it as the subagent `model`.",
    "- The todo list is the `todo` tool. Wake-ups and `/loop` are the `loop` tool. Past sessions are the `transcripts` tool. Isolated checkouts come from the `worktree_create` tool.",
    `- This session's ID is ${sessionID}.`,
    `- The pstack store for this project (where playbooks keep ledgers, trails, and orchestrate state) is ${store}.`,
  ].join("\n")

export default Plugin.define({
  id: "pstack",
  async setup(ctx) {
    const options = ctx.options as { routing?: boolean; commands?: boolean }
    const loops = createLoops(ctx)
    const prompts = new Map(manifest.agents.map((a) => [a.id, agentPrompt(a)]))
    const store = join(dataHome, "opencode", "pstack", "store", ctx.location.project.id)

    await ctx.skill.transform((editor) => {
      for (const skill of manifest.skills) {
        editor.add({
          id: Skill.ID.make(skill.id),
          name: Skill.Name.make(skill.name),
          ...(skill.description ? { description: skill.description } : {}),
          ...(skill.autoinvoke === false ? { autoinvoke: false } : {}),
          path: join(distDir, skill.file) as Skill.Info["path"],
          content: body(skill.file),
        })
      }
    })

    await ctx.agent.transform((editor) => {
      for (const entry of manifest.agents) {
        editor.update(Agent.ID.make(entry.id), (agent) => {
          agent.name = Agent.Name.make(entry.name ?? entry.id)
          if (entry.description) agent.description = entry.description
          agent.mode = entry.mode ?? "subagent"
          if (entry.color) agent.color = entry.color
          if (agent.mode === "subagent") agent.permissions.push({ action: "question", resource: "*", effect: "deny" })
        })
      }
    })

    await ctx.tool.transform((editor) => {
      editor.add(todoTool(ctx))
      editor.add(loops.tool)
      editor.add(transcriptsTool(ctx))
    })

    await ctx.command.transform((editor) => {
      editor.add({
        name: "loop",
        description: "Re-prompt this session on an interval: /loop [30m] <prompt with a finish condition>, /loop list, /loop stop [id]",
        execute: ({ sessionID, prompt }) => loops.command(sessionID, prompt.text).then(() => undefined),
      })
      if (options.commands === false) return
      for (const skill of manifest.skills) {
        if (skill.id.startsWith("principle-")) continue
        editor.add({
          name: skill.id,
          description: `pstack: ${skill.description ?? skill.name}`.slice(0, 200),
          execute: async ({ sessionID, prompt, delivery }) => {
            await ctx.session.prompt({
              ...prompt,
              sessionID,
              text: prompt.text.trim() || `Run the ${skill.id} skill.`,
              skills: [...(prompt.skills ?? []), { id: Skill.ID.make(skill.id) }],
              delivery,
            })
          },
        })
      }
    })

    await ctx.session.hook("context", async (event) => {
      const parts = [`<pstack-runtime>\n${runtime(event.sessionID, store)}\n</pstack-runtime>`]
      if (options.routing) parts.push(`<pstack-routing>\n${routing}\n</pstack-routing>`)
      parts.push(`<pstack-model-sheet>\n${renderSheet(ctx.location.directory)}\n</pstack-model-sheet>`)
      const agent = prompts.get(event.agent)
      if (agent) parts.push(`<pstack-agent id="${event.agent}">\n${agent}\n</pstack-agent>`)
      const todos = await readTodos(ctx, event.sessionID)
      if (todos.length) parts.push(`<pstack-todo>\nCurrent todo list (update it with the \`todo\` tool):\n${renderTodos(todos)}\n</pstack-todo>`)
      event.system.push({ type: "text", text: parts.join("\n\n") })
    })

    await loops.restore()
  },
})
