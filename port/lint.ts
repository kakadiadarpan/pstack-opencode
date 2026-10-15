// Cursor-only vocabulary that must not survive into dist/. A new upstream use either gets a rule in
// rules.ts or, when the word is legitimate, an entry in `allow`.
export const residue: RegExp[] = [
  /\bcursor\b/i,
  /\.cursor\b/,
  /cursor-team-kit/,
  /\bTask\b/,
  /subagent_type/,
  /generalPurpose/,
  /readonly/i,
  /run_in_background/,
  /AskQuestion/,
  /agent-transcripts/,
  /\.mdc\b/,
  /environment: "/,
  /grok-[0-9.]+-(?:max|xhigh|high|medium|low)/,
  /claude-opus-5-5/,
  /composer-/,
  /is_background/,
  /Custom Mode/i,
  /\btodolist\b/,
]

// [dist path regex, substring of the offending line]
const allow: [RegExp, string][] = [
  [/^skills\/typescript-best-practices\//, "readonly"],
  [/^skills\/why\/SKILL\.md$/, "cursor location"],
  [/^skills\/poteto-mode\/playbooks\/multi-phase-plan\.md$/, "## <Task as a verb phrase>"],
  [/^licenses\//, ""],
]

export function allowed(path: string, line: string, _match: string) {
  return allow.some(([file, fragment]) => file.test(path) && line.includes(fragment))
}
