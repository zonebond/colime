import { describe, expect, test, beforeEach } from "bun:test"
import { Effect, Layer } from "effect"
import { MemoryStore } from "@/memory/store"
import { AppFileSystem } from "@ravens-ai/core/filesystem"
import { Global } from "@ravens-ai/core/global"
import fs from "fs/promises"
import path from "path"

const TEST_DIR = "/tmp/opencode-memory-test"

const testGlobal = Layer.succeed(
  Global.Service,
  Global.Service.of(Global.make({ config: TEST_DIR })),
)

const storeLayer = Layer.provideMerge(
  MemoryStore.layer,
  Layer.mergeAll(AppFileSystem.defaultLayer, testGlobal),
)

async function runStore<A>(effect: Effect.Effect<A, any, any>): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(storeLayer)))
}

beforeEach(async () => {
  await fs.rm(path.join(TEST_DIR, "memory"), { recursive: true, force: true }).catch(() => {})
  await fs.mkdir(path.join(TEST_DIR, "memory"), { recursive: true })
})

describe("Memory Store (user category)", () => {
  test("read returns empty for nonexistent file", async () => {
    await runStore(
      Effect.gen(function* () {
        const store = yield* MemoryStore.Service
        const entries = yield* store.read("user")
        expect(entries.length).toBe(0)
      }),
    )
  })

  test("append and read a user memory entry", async () => {
    await runStore(
      Effect.gen(function* () {
        const store = yield* MemoryStore.Service
        yield* store.append("user", {
          id: "mem_test01" as any,
          category: "user",
          title: "Preference",
          content: "I prefer pnpm over npm",
          tags: ["package-manager"],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        const entries = yield* store.read("user")
        expect(entries.length).toBe(1)
        expect(entries[0].content).toBe("I prefer pnpm over npm")
      }),
    )
  })

  test("remove a user memory entry", async () => {
    await runStore(
      Effect.gen(function* () {
        const store = yield* MemoryStore.Service
        yield* store.append("user", {
          id: "mem_test02" as any,
          category: "user",
          title: "Test",
          content: "Remove me",
          tags: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        const before = yield* store.read("user")
        expect(before.length).toBe(1)

        yield* store.remove("user", "mem_test02" as any)
        const after = yield* store.read("user")
        expect(after.length).toBe(0)
      }),
    )
  })

  test("path returns correct location for user category", async () => {
    await runStore(
      Effect.gen(function* () {
        const store = yield* MemoryStore.Service
        const p = yield* store.path("user")
        expect(p).toContain("memory")
        expect(p).toContain("user.md")
      }),
    )
  })
})
