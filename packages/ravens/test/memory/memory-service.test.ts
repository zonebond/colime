import { describe, expect, test, beforeEach } from "bun:test"
import { Effect, Layer } from "effect"
import { Memory } from "@/memory/memory"
import { MemoryStore } from "@/memory/store"
import { AppFileSystem } from "@ravens-ai/core/filesystem"
import { Global } from "@ravens-ai/core/global"
import fs from "fs/promises"
import path from "path"

const TEST_DIR = "/tmp/opencode-memory-service-test"

const testGlobal = Layer.succeed(
  Global.Service,
  Global.Service.of(Global.make({ config: TEST_DIR })),
)

const memoryLayer = Layer.provideMerge(
  Memory.layer,
  Layer.provideMerge(
    MemoryStore.layer,
    Layer.mergeAll(AppFileSystem.defaultLayer, testGlobal),
  ),
)

async function run<A>(effect: Effect.Effect<A, any, any>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(memoryLayer)))
}

beforeEach(async () => {
  await fs.rm(path.join(TEST_DIR, "memory"), { recursive: true, force: true }).catch(() => {})
  await fs.mkdir(path.join(TEST_DIR, "memory"), { recursive: true })
})

describe("Memory Service", () => {
  test("load returns empty context when no memories exist", async () => {
    await run(
      Effect.gen(function* () {
        const memory = yield* Memory.Service
        const ctx = yield* memory.load(2000)
        expect(ctx.user).toBe("")
        expect(ctx.project).toBe("")
        expect(ctx.totalTokens).toBe(0)
      }),
    )
  })

  test("save and search round-trip (user category)", async () => {
    await run(
      Effect.gen(function* () {
        const memory = yield* Memory.Service
        const entry = yield* memory.save({
          category: "user",
          content: "I prefer pnpm over npm",
          title: "Package manager preference",
          tags: ["package-manager"],
        })
        expect(entry.id).toContain("mem_")
        expect(entry.category).toBe("user")

        const results = yield* memory.search({ query: "pnpm" })
        expect(results.length).toBe(1)
        expect(results[0].content).toBe("I prefer pnpm over npm")
      }),
    )
  })

  test("search filters by category", async () => {
    await run(
      Effect.gen(function* () {
        const memory = yield* Memory.Service
        yield* memory.save({ category: "user", content: "prefers pnpm", title: "pkg" })
        yield* memory.save({ category: "user", content: "uses Redis cache", title: "cache" })

        const userResults = yield* memory.search({ query: "pnpm", category: "user" })
        expect(userResults.length).toBe(1)
        expect(userResults[0].category).toBe("user")
      }),
    )
  })

  test("remove a memory entry", async () => {
    await run(
      Effect.gen(function* () {
        const memory = yield* Memory.Service
        const entry = yield* memory.save({
          category: "user",
          content: "Don't modify auth module",
          title: "Feedback",
        })

        const before = yield* memory.search({ query: "auth" })
        expect(before.length).toBe(1)

        yield* memory.remove(entry.id, "user")
        const after = yield* memory.search({ query: "auth" })
        expect(after.length).toBe(0)
      }),
    )
  })

  test("load respects token budget", async () => {
    await run(
      Effect.gen(function* () {
        const memory = yield* Memory.Service
        yield* memory.save({ category: "user", content: "a".repeat(100), title: "long" })
        const ctx = yield* memory.load(10)
        expect(ctx.totalTokens).toBeLessThanOrEqual(50)
      }),
    )
  })
})
