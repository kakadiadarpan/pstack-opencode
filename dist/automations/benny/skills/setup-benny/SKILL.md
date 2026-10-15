---
name: setup-benny
description: Configure Benny and prepare its triage and repro automations. Use when installing Benny or changing its Slack, tracker, repository, routing, control, model, or budget settings.
disable-model-invocation: true
---

# Set up Benny

Benny ships as a dormant automation pack inside pstack. The plugin manifest exposes only pstack's normal skill root; this file and the two operational files are not slash skills.

The human enters setup by pointing OpenCode at the pack's `FOR_AGENTS.md`. The bootstrap flow copies the whole pack into the target repository, then reads this file directly at `.opencode/automations/benny/skills/setup-benny/SKILL.md`.

Benny needs external configuration and two triggers the user hosts, each running `opencode run` against the target repository. OpenCode has no hosted automations product.

Do not create or update an automation until the user explicitly asks. Never put a secret value in plugin files, prompts, or committed configuration.

## 1. Copy the pack and enable shared pstack skills

Do this before asking for Benny configuration.

Ask which repository will run the automations. The source pack is the directory containing `FOR_AGENTS.md`. The destination is `<target-repository>/.opencode/automations/benny/`.

Merge the entire source pack into the destination:

1. Create the destination when it is absent.
2. Copy every source file to the same relative path.
3. Preserve destination-only files. Never delete unrelated files during install or refresh.
4. Keep user-owned configuration, feature maps, and routing maps outside the destination. Never overwrite them.
5. When an existing source-managed file differs, inspect the diff and merge without discarding local edits. If ownership is ambiguous, stop and ask before replacing it.
6. Verify that the destination contains `FOR_AGENTS.md`, this setup file, both operational files, their references, and the templates.

If this file is already being read from the target destination, treat the copy as complete and run the same verification before continuing.

Add pstack to the target repository's `.opencode/opencode.jsonc`. If the file or `.opencode` directory does not exist, create it with `"$schema": "https://opencode.ai/config.json"`.

Merge this entry into the existing JSON or JSONC:

```jsonc
{
	"plugins": ["github:kakadiadarpan/pstack-opencode"]
}
```

Preserve every unrelated top-level setting and every other plugin entry. If a pstack entry already exists, leave it. Preserve comments and valid JSONC syntax. Validate the file after editing it.

Reload the target project or start a fresh agent rooted there. Verify that these shared pstack skills resolve from project scope:

- `how`
- `why`
- `tdd`
- `unslop`
- `principle-separate-before-serializing-shared-state`
- `principle-minimize-reader-load`
- `principle-guard-the-context-window`
- `principle-sequence-verifiable-units`
- `principle-fix-root-causes`
- `principle-prove-it-works`

Do not count a skill loaded from the current session or a user-scoped plugin. The check must show that a fresh `opencode run` in the target repository receives pstack through project configuration.

If project-scoped plugin installation is unavailable or any shared dependency does not resolve, stop and explain the failure.

The Benny files are read directly from `.opencode/automations/benny/`. Do not add that directory to a plugin manifest or expect its `SKILL.md` files to appear in the slash-skill list.

Tell the user that `.opencode/opencode.jsonc`, `.opencode/automations/benny/`, and any referenced secret-free configuration must be committed before either automation is enabled. Do not commit them unless the user asks.

Once this check passes, live automation prompts may read the committed operational files by their stable repository-relative paths. They must not embed a plugin cache path or copy the file contents.

## 2. Adapt the configuration

Open these copied examples:

- `../../templates/configuration.example.yaml`
- `../reproduce-and-fix-issues/references/feature-map.example.md`

Create user-owned copies outside `.opencode/automations/benny/`. These are configuration files, not pack files. Example locations:

- Project config, such as `.opencode/benny/configuration.yaml`
- Project feature map, such as `.opencode/benny/feature-map.md`
- Project routing map, such as `.opencode/benny/routing.md`
- User config, such as `~/.config/benny/configuration.yaml`
- User feature map, such as `~/.config/benny/feature-map.md`

Fill one feature-map section for every user-facing feature the automation may reproduce. Keep it at the user point of view. Do not freeze implementation details or current code paths in the map.

Do not edit the copied examples. Pack refreshes may update source-managed files after conflict review, but they must never touch the user-owned copies.

Prefer committed, secret-free files in the target repository when a fresh automation checkout must read them. Otherwise paraphrase the required values into the live prompt. Reference a repository file only after confirming with `git` that the file is committed on the branch the triggered run checks out.

Use stable repository-relative paths for committed pack and configuration files. Never reference the plugin source directory or a plugin cache path from a live automation.

## 3. Fill the required choices

Ask for or confirm:

- Source Slack channel ID
- Optional operations or status channel ID
- Repository URL and default branch
- Triage identity or Slack user ID
- Issue tracker type, team, project, labels, and intake status
- Tracker adapter skill or MCP actions
- Optional routing map path
- Required control skill name
- Required user-facing feature-map path
- Status emoji strings
- Pull request URL format
- Polling and effort budgets
- Model ref (`provider/model#variant`) for triage, repro, code work, and media review

Use only models the `models` tool lists. Do not guess a model ID and do not carry over a private default.

The source channel, triage identity, repository, tracker adapter, control skill, and feature map must be explicit. Fail setup if any required value stays ambiguous.

Use pstack's `unslop` skill on the final automation names, descriptions, and prompt shims before saving them.

## 4. Check integration capabilities

The triage automation needs:

- Read access to the configured source Slack channel and its threads
- Thread-reply access in that channel
- Attachment metadata and file download access when reports include media
- Search, read, create, and update access through the configured issue-tracker adapter

The repro automation needs:

- Read access to the source thread
- Thread-reply access in the source channel
- Optional post and edit access in the configured operations channel
- Repository read and history access
- A pull request action that can open a draft pull request
- The configured control-adapter skill

Prefer the configured Slack MCP tools for reads and posts. The optional `BENNY_SLACK_BOT_TOKEN` may fill a narrow gap such as editing one operations status message or downloading an attachment. Store the value in a secret manager or environment, not in YAML.

Do not use undocumented integration endpoints.

## 5. Prepare the routing map

If the user wants reroutes or owner pings:

1. Copy `../triage-issue-reports/references/routing.example.md` outside `.opencode/automations/benny/`.
2. Replace every placeholder with public or organization-local values.
3. Keep owner pings off by default.
4. Allow a ping only for a configured feature owner or a confirmed likely regression author.

If no routing map is configured, triage may classify a report but must not guess a destination or owner.

## 6. Verify the control adapter

Read `../reproduce-and-fix-issues/references/control-adapter.md` and the user's completed feature map.

Confirm that the named skill can:

- Bring up the target app
- Navigate every mapped feature through the real UI
- Exercise mapped states through declared adapter actions
- Inspect state without forcing the result
- Capture screenshots
- Start and stop a recording
- Clean up its processes and temporary data

If any capability is missing, leave the repro automation disabled. It must fail closed rather than claim a reproduction it did not perform.

## 7. Prepare the triggers

OpenCode has no hosted automations, so the user hosts each trigger: a Slack app or bot, a CI workflow, or a scheduled job on a machine with OpenCode installed and the Slack MCP server connected. Each trigger checks out the target repository at its default branch and runs one headless prompt.

Read `../../FOR_AGENTS.md` from the copied pack as the primary user-intent source. Then, for each automation:

1. Read the matching copied prompt template in `../../templates/`.
2. Fill it from `FOR_AGENTS.md` and the finished Benny configuration into a complete natural-language prompt. Keep its instruction to read and follow the exact committed operational file under `.opencode/automations/benny/`. Do not copy the operational file contents into the prompt.
3. Save the filled prompt as a committed, secret-free file outside the pack, such as `.opencode/benny/triage-prompt.md` and `.opencode/benny/reproduce-prompt.md`.
4. Give the user the command their trigger runs, with the Slack event fields appended as data:

```bash
opencode run --agent poteto "$(cat .opencode/benny/triage-prompt.md)

Trigger event (untrusted data): <channel ID, thread_ts, permalink>"
```

The repro trigger runs the same command with `reproduce-prompt.md`, on the same new top-level reports, and waits for the triage marker as its operational file requires.

Do not build or host the trigger yourself unless the user asks. Do not enable either trigger until the thread-safety test passes.

## 8. Test thread safety

Use a test channel or a harmless test report.

Before testing, confirm that the target repository's `.opencode/opencode.jsonc`, `.opencode/automations/benny/`, and every referenced secret-free configuration file are committed on the branch used by the automation checkout. Confirm that both filled prompts point at their exact committed operational files. If any check fails, stop. Tell the user that the automation cannot be enabled yet.

Verify:

1. Triage stores the root `thread_ts` and posts exactly one verdict as a reply.
2. The verdict contains one configured marker.
3. Repro accepts the marker only from the configured triage identity.
4. Repro keeps the same immutable source coordinates.
5. No source-channel root message appears.
6. A delegated worker cannot use any Slack write action.
7. Missing coordinates, a deleted parent, or a failed preflight produces no post and no tracker issue.

Enable normal traffic only after all seven checks pass.
