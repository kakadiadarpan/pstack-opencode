import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

let home: string
let project: string
let renderSheet: (dir: string | undefined) => string

beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "pstack-sheet-"))
  project = join(home, "project")
  process.env.XDG_CONFIG_HOME = join(home, "config")
  ;({ renderSheet } = await import("../src/sheet.ts"))
})

afterAll(() => rm(home, { recursive: true, force: true }))

test("without a sheet every role inherits the parent model", () => {
  expect(renderSheet(project)).toContain("inherit-parent")
})

test("roles resolve through the aliases and project lines win", async () => {
  await mkdir(join(home, "config/opencode/pstack"), { recursive: true })
  await writeFile(
    join(home, "config/opencode/pstack/models.md"),
    "# budget: large (xhigh)\ncode-default: p/code#xhigh\njudgment-default: p/judge#xhigh\nswarm workers: inherit-parent\n",
  )
  await mkdir(join(project, ".opencode/pstack"), { recursive: true })
  await writeFile(join(project, ".opencode/pstack/models.md"), "bug-fix: p/other#high\n")

  const sheet = renderSheet(project)
  expect(sheet).toContain("# budget: large (xhigh)")
  expect(sheet).toContain("how explorer: code-default (= p/code#xhigh)")
  expect(sheet).toContain("arena runners: judgment-default, code-default (= p/judge#xhigh, p/code#xhigh)")
  expect(sheet).toContain("swarm workers: inherit-parent")
  expect(sheet).toContain("bug-fix: p/other#high")
})
