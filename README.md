# pstack for OpenCode

An OpenCode V2 port of [pstack](https://github.com/cursor/plugins/tree/main/pstack), Lauren Tan's (poteto's) skill stack for rigorous agent work in Cursor. You get the same skills, playbooks, and principles, plus an OpenCode plugin that supplies the host features those skills expect from Cursor.

## Install

```sh
opencode plugin add github:kakadiadarpan/pstack-opencode
```

Then, in a new session:

1. Run `/setup-pstack`. It picks a model per role from your providers, writes `~/.config/opencode/pstack/models.md`, and raises `experimental.subagent_depth` to 3.
2. Start real work with `/poteto-mode <goal and how to tell it's done>`.
3. To keep poteto mode on for a whole session, press `Tab` to switch to the **Poteto** agent.

New to pstack? Read the [guide](dist/docs/guide/README.md), or ask `/poteto-help`.

## What the plugin adds

Upstream pstack leans on Cursor features. The plugin maps each one onto OpenCode.

| Cursor | OpenCode port |
| --- | --- |
| `Task` tool, `subagent_type` | `subagent` tool, `agent`. Read-only `generalPurpose` becomes `explore`. Agent-mode `generalPurpose` becomes `general`. |
| `poteto-agent`, Comment Sicko subagents | Registered as `poteto-agent` and `comment-sicko` subagents. |
| Custom Mode (Option+Enter) | The **Poteto** primary agent. It keeps `poteto-mode` in context every turn. |
| `~/.cursor/rules/pstack-models.mdc` | `~/.config/opencode/pstack/models.md`, injected into every request. Projects can override single lines in `.opencode/pstack/models.md`. |
| Model slugs such as `claude-opus-5-5-xhigh` | Model refs such as `vercel/anthropic/claude-opus-5.5#xhigh`. The `#variant` is the reasoning level. |
| Todo list | A `todo` tool. The current list is re-shown to the model every turn. |
| `/loop` | A `/loop [interval] <prompt>` command and a `loop` tool the agent can arm itself. |
| `agent-transcripts/` | A `transcripts` tool that exports sessions as JSONL in Cursor's layout. |
| `/poteto-mode`, `/how`, and other slash skills | One slash command per skill. `@skill-id` also works. |
| Cloud subagents | A git worktree per worker, created with `worktree_create`. |
| `cursor-team-kit`'s `deslop`, `control-cli`, `control-ui` | Bundled. |
| Cursor's built-in `create-skill` | A bundled `create-skill` skill written for OpenCode. |

Plugin options go in the object form of the plugin entry:

```jsonc
{
  "plugins": [{ "package": "github:kakadiadarpan/pstack-opencode", "options": { "routing": true } }]
}
```

- `routing` (default `false`) tells every session to load `poteto-mode` on its own for multi-file, design, unknown-cause bug, and perf work. Upstream has no automatic routing, so it is off by default.
- `commands` (default `true`) registers the per-skill slash commands.

## Differences from upstream

- Subagents run on your machine. An overnight run needs the machine awake.
- The benny automation pack is ported, but OpenCode has no hosted automations. You host the Slack trigger that runs `opencode run`. See [`dist/automations/benny`](dist/automations/benny/README.md).
- `make-bot-ui` is dropped. It drives Cursor's Grok Bot routines, which have no OpenCode equivalent.
- A skill you already have with the same ID (for example your own `unslop`) takes precedence over the bundled one.
- `worktree-audit.sh` still looks for Cursor transcripts when it reports the newest chat that touched a worktree, so that column stays empty.

## How the port stays current

`vendor/` holds upstream files byte for byte, pinned in `upstream.json`. `scripts/build.ts` turns them into `dist/` in three passes:

1. `port/rules.ts` rewrites Cursor vocabulary. Every rule must still match, so an upstream rewrite fails the build instead of shipping stale text.
2. `port/overrides/` replaces the few files that are Cursor-specific end to end, such as `setup-pstack`.
3. `port/additions/` adds files upstream does not have, such as the Poteto agent and `create-skill`.

Then `port/lint.ts` fails the build on any Cursor-only term left in `dist/`.

To pull a new upstream version:

```sh
bun install
bun run sync:latest   # move the pin and re-vendor
bun run build         # fix any failing rule or lint hit, then rebuild
bun test && bun run typecheck
```

Commit `vendor/`, `dist/`, and `upstream.json` together.

## Credits

pstack is by [Lauren Tan](https://x.com/poteto), MIT licensed. `deslop`, `control-cli`, and `control-ui` come from Cursor's `cursor-team-kit`, MIT licensed. Both licenses ship in [`dist/licenses/`](dist/licenses/). The rewrite approach borrows from [michael-denyer/pstack-claude](https://github.com/michael-denyer/pstack-claude).
