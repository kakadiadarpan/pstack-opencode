import { expect, test } from "bun:test"
import { parseDuration } from "../src/loop.ts"

test("parses loop intervals", () => {
  expect(parseDuration("90s")).toBe(90_000)
  expect(parseDuration("30m")).toBe(1_800_000)
  expect(parseDuration("1h")).toBe(3_600_000)
  expect(parseDuration("1.5h")).toBe(5_400_000)
  expect(parseDuration("2d")).toBe(172_800_000)
})

test("rejects prompts that are not intervals", () => {
  expect(parseDuration("check")).toBeUndefined()
  expect(parseDuration("30")).toBeUndefined()
})
