#!/usr/bin/env bun
// Usage: bun scripts/sync.ts           re-vendor the pinned sha
//        bun scripts/sync.ts --latest  move the pin to the tip of `ref`, then re-vendor
import { $ } from "bun"
import { cp, mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"

type Component = { name: string; from: string; to: string; include?: string[]; exclude?: string[] }
type Upstream = { remote: string; ref: string; sha: string; components: Component[] }

const root = join(import.meta.dir, "..")
const manifestPath = join(root, "upstream.json")
const manifest: Upstream = await Bun.file(manifestPath).json()
const latest = process.argv.includes("--latest")

const work = await mkdtemp(join(tmpdir(), "pstack-sync-"))
try {
  await $`git clone --quiet --filter=blob:none --no-checkout ${manifest.remote} ${work}`.quiet()
  const sha = latest ? (await $`git -C ${work} rev-parse origin/${manifest.ref}`.text()).trim() : manifest.sha
  await $`git -C ${work} sparse-checkout set ${manifest.components.map((c) => c.from)}`.quiet()
  await $`git -C ${work} checkout --quiet ${sha}`.quiet()

  for (const component of manifest.components) {
    const source = join(work, component.from)
    const target = join(root, component.to)
    await rm(target, { recursive: true, force: true })
    for (const file of await walk(source)) {
      const rel = relative(source, file)
      if (!selected(rel, component)) continue
      await cp(file, join(target, rel), { recursive: false, force: true })
    }
    console.log(`vendored ${component.name} -> ${component.to}`)
  }

  if (sha !== manifest.sha) {
    console.log(`pin moved ${manifest.sha.slice(0, 7)} -> ${sha.slice(0, 7)}`)
    await Bun.write(manifestPath, JSON.stringify({ ...manifest, sha }, null, 2) + "\n")
  }
} finally {
  await rm(work, { recursive: true, force: true })
}

function selected(rel: string, component: Component) {
  const matches = (pattern: string) => (pattern.endsWith("/") ? rel.startsWith(pattern) : rel === pattern)
  if (component.include && !component.include.some(matches)) return false
  return !(component.exclude ?? []).some(matches)
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir)) {
    const path = join(dir, entry)
    if ((await stat(path)).isDirectory()) out.push(...(await walk(path)))
    else out.push(path)
  }
  return out
}
