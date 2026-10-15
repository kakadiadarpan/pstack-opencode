import type { Plugin } from "@opencode/plugin"

type Context = Plugin.Context

const statuses = ["pending", "in_progress", "completed", "cancelled"] as const
type Todo = { content: string; status: (typeof statuses)[number] }

const key = (sessionID: string) => `todo/${sessionID}`
const marks: Record<Todo["status"], string> = { pending: "[ ]", in_progress: "[~]", completed: "[x]", cancelled: "[-]" }

export const renderTodos = (todos: Todo[]) => todos.map((t, i) => `${i + 1}. ${marks[t.status]} ${t.content}`).join("\n")

export async function readTodos(ctx: Context, sessionID: string) {
  return ((await ctx.storage.get(key(sessionID))) as Todo[] | undefined) ?? []
}

export const todoTool = (ctx: Context) => ({
  name: "todo",
  description: [
    "Write this session's todo list. Each call replaces the whole list, so send every item, in order, with its current status.",
    "Use it for multi-step work: open the list before starting, keep exactly one item in_progress, and mark items completed as soon as they are done.",
    "A step you choose not to do stays in the list as cancelled with a `skip: <reason>` suffix.",
    "The current list is shown to you at the end of the system prompt on every turn.",
  ].join("\n"),
  input: {
    type: "object",
    properties: {
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            content: { type: "string", description: "One bounded action, in imperative form" },
            status: { type: "string", enum: [...statuses] },
          },
          required: ["content", "status"],
          additionalProperties: false,
        },
      },
    },
    required: ["todos"],
    additionalProperties: false,
  },
  options: { codemode: false },
  execute: async (input: unknown, context: { sessionID: string }) => {
    const { todos } = input as { todos: Todo[] }
    await ctx.storage.set(key(context.sessionID), todos)
    const done = todos.filter((t) => t.status === "completed").length
    return { content: `${done}/${todos.length} done\n${renderTodos(todos)}`, metadata: { todos } }
  },
})
