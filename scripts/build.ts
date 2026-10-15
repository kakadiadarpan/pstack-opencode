#!/usr/bin/env bun
// Builds dist/ from vendor/ (verbatim upstream) + port/rules.ts + port/overrides + port/additions.
// Fails when a rule stops matching (upstream drifted) or a Cursor-ism survives into dist/.
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { rules, type Rule } from "../port/rules.ts"
import { residue, allowed } from "../port/lint.ts"

const root = join(import.meta.dir, "..")
const dist = join(root, "dist")
const overridesDir = join(root, "port/overrides")
const additionsDir = join(root, "port/additions")

// vendor path prefix -> dist path prefix. Unlisted vendor files are not shipped.
const layout: [from: string, to: string][] = [
  ["vendor/pstack/skills/", "skills/"],
  ["vendor/pstack/agents/", "agents/"],
  ["vendor/pstack/docs/", "docs/"],
  ["vendor/pstack/automations/", "automations/"],
  ["vendor/pstack/LICENSE", "licenses/pstack-LICENSE"],
  ["vendor/cursor-team-kit/skills/", "skills/"],
  ["vendor/cursor-team-kit/LICENSE", "licenses/cursor-team-kit-LICENSE"],
]

// Cursor-only features with no OpenCode equivalent.
const dropped = ["skills/make-bot-ui/"]

const isText = (path: string) => /\.(md|mdc|txt|ya?ml|tsv)$/.test(path)

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir).catch(() => [])) {
    const path = join(dir, entry)
    if ((await stat(path)).isDirectory()) out.push(...(await walk(path)))
    else out.push(path)
  }
  return out
}

function target(vendorRel: string) {
  for (const [from, to] of layout) {
    if (from.endsWith("/") ? vendorRel.startsWith(from) : vendorRel === from) {
      const out = to + vendorRel.slice(from.length)
      return dropped.some((d) => out.startsWith(d)) ? undefined : out
    }
  }
}

function applies(rule: Rule, path: string) {
  return rule.files ? rule.files.test(path) : path.endsWith(".md")
}

function apply(rule: Rule, text: string): [string, number] {
  if (typeof rule.find === "string") {
    const parts = text.split(rule.find)
    return [parts.join(rule.replace), parts.length - 1]
  }
  if (!rule.find.global) throw new Error(`rule regex must be global: ${rule.find}`)
  let count = 0
  const out = text.replace(rule.find, (...args) => {
    count++
    return rule.replace.replace(/\$(\d)/g, (_, i) => args[Number(i)] ?? "")
  })
  return [out, count]
}

await rm(dist, { recursive: true, force: true })

const overrides = new Set((await walk(overridesDir)).map((p) => relative(overridesDir, p)))
const hits = new Map<Rule, number>(rules.map((r) => [r, 0]))
const written: string[] = []

for (const file of await walk(join(root, "vendor"))) {
  const out = target(relative(root, file))
  if (!out) continue
  const dest = join(dist, out)
  await mkdir(dirname(dest), { recursive: true })
  if (overrides.has(out)) continue
  if (!isText(out)) {
    await cp(file, dest)
    written.push(out)
    continue
  }
  let text = await Bun.file(file).text()
  for (const rule of rules) {
    if (!applies(rule, out)) continue
    const [next, count] = apply(rule, text)
    text = next
    hits.set(rule, hits.get(rule)! + count)
  }
  await Bun.write(dest, text)
  written.push(out)
}

for (const rel of overrides) {
  await mkdir(dirname(join(dist, rel)), { recursive: true })
  await cp(join(overridesDir, rel), join(dist, rel))
  written.push(rel)
}
for (const file of await walk(additionsDir)) {
  const rel = relative(additionsDir, file)
  await mkdir(dirname(join(dist, rel)), { recursive: true })
  await cp(file, join(dist, rel))
  written.push(rel)
}

const problems: string[] = []
for (const [rule, count] of hits) {
  const min = rule.count ?? 1
  if (count < min) problems.push(`rule matched ${count}x (want >= ${min}): ${String(rule.find).slice(0, 120)}`)
}

for (const rel of written.filter((p) => p.endsWith(".md")).sort()) {
  const lines = (await Bun.file(join(dist, rel)).text()).split("\n")
  lines.forEach((line, i) => {
    for (const pattern of residue) {
      const match = line.match(pattern)
      if (match && !allowed(rel, line, match[0])) problems.push(`${rel}:${i + 1}: residue "${match[0]}": ${line.trim().slice(0, 160)}`)
    }
  })
}

await Bun.write(join(dist, "manifest.json"), JSON.stringify(await manifest(), null, 2) + "\n")

if (problems.length) {
  console.error(problems.join("\n"))
  console.error(`\n${problems.length} problem(s)`)
  process.exit(1)
}
console.log(`built ${written.length} files into dist/`)

async function manifest() {
  const skills = []
  for (const file of (await walk(join(dist, "skills"))).sort()) {
    if (!file.endsWith("/SKILL.md")) continue
    const rel = relative(dist, file)
    if (rel.split("/").length !== 3) continue
    const fm = frontmatter(await Bun.file(file).text())
    const id = rel.split("/")[1]!
    skills.push({
      id,
      name: typeof fm.name === "string" ? fm.name : id,
      description: typeof fm.description === "string" ? fm.description : undefined,
      autoinvoke: fm["disable-model-invocation"] === true ? false : undefined,
      file: rel,
    })
  }
  const agents = []
  for (const file of (await walk(join(dist, "agents"))).sort()) {
    if (!file.endsWith(".md")) continue
    const rel = relative(dist, file)
    const fm = frontmatter(await Bun.file(file).text())
    agents.push({ id: rel.replace(/^agents\//, "").replace(/\.md$/, ""), ...fm, file: rel })
  }
  return { upstream: (await Bun.file(join(root, "upstream.json")).json()).sha, skills, agents }
}

function frontmatter(text: string): Record<string, unknown> {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/)
  return match ? (Bun.YAML.parse(match[1]!) as Record<string, unknown>) : {}
}
