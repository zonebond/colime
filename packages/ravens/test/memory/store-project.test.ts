import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import path from "path"
import { MemoryStore } from "@/memory/store"
import { MemoryID } from "@/memory/schema"
import { AppFileSystem } from "@ravens-ai/core/filesystem"
import { Global } from "@ravens-ai/core/global"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const testGlobal = Layer.succeed(
  Global.Service,
  Global.Service.of(Global.make({ config: "/tmp/opencode-memory-project-test" })),
)

const testLayer = Layer.provideMerge(
  MemoryStore.layer,
  Layer.mergeAll(AppFileSystem.defaultLayer, testGlobal),
)

const it = testEffect(testLayer)

const makeEntry = (category: "project" | "feedback" | "reference", title: string, content: string, tags: string[] = []) => ({
  id: MemoryID.ascending(),
  category,
  title,
  content,
  tags,
  createdAt: Date.now(),
  updatedAt: Date.now(),
})

describe("Memory Store (project categories)", () => {
  it.instance("path returns project-level directory for project category", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const store = yield* MemoryStore.Service
      const p = yield* store.path("project")
      expect(p).toBe(path.join(test.directory, ".colime", "memory", "project.md"))
    }),
  )

  it.instance("append and read project memory", () =>
    Effect.gen(function* () {
      const store = yield* MemoryStore.Service
      yield* store.append("project", makeEntry("project", "Architecture", "Using Redis for session cache", ["architecture", "cache"]))
      const entries = yield* store.read("project")
      expect(entries.length).toBe(1)
      expect(entries[0].content).toBe("Using Redis for session cache")
    }),
  )

  it.instance("feedback and reference categories work", () =>
    Effect.gen(function* () {
      const store = yield* MemoryStore.Service
      yield* store.append("feedback", makeEntry("feedback", "Correction", "Don't modify auth without asking", ["auth"]))
      yield* store.append("reference", makeEntry("reference", "DB Schema", "Schema in prisma/schema.prisma", ["database"]))
      const feedback = yield* store.read("feedback")
      const reference = yield* store.read("reference")
      expect(feedback.length).toBe(1)
      expect(feedback[0].category).toBe("feedback")
      expect(reference.length).toBe(1)
      expect(reference[0].category).toBe("reference")
    }),
  )

  it.instance("categories are isolated from each other", () =>
    Effect.gen(function* () {
      const store = yield* MemoryStore.Service
      yield* store.append("project", makeEntry("project", "Project dec", "Redis cache"))
      yield* store.append("feedback", makeEntry("feedback", "Feedback note", "Use pnpm"))
      const projectEntries = yield* store.read("project")
      const feedbackEntries = yield* store.read("feedback")
      expect(projectEntries.length).toBe(1)
      expect(projectEntries[0].content).toBe("Redis cache")
      expect(feedbackEntries.length).toBe(1)
      expect(feedbackEntries[0].content).toBe("Use pnpm")
    }),
  )

  it.instance("remove from project category", () =>
    Effect.gen(function* () {
      const store = yield* MemoryStore.Service
      const entry = makeEntry("project", "To remove", "temporary entry")
      yield* store.append("project", entry)
      const before = yield* store.read("project")
      expect(before.length).toBe(1)
      yield* store.remove("project", entry.id)
      const after = yield* store.read("project")
      expect(after.length).toBe(0)
    }),
  )

  it.instance("path returns correct directory for feedback and reference", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const store = yield* MemoryStore.Service
      const feedbackPath = yield* store.path("feedback")
      const referencePath = yield* store.path("reference")
      expect(feedbackPath).toBe(path.join(test.directory, ".colime", "memory", "feedback.md"))
      expect(referencePath).toBe(path.join(test.directory, ".colime", "memory", "reference.md"))
    }),
  )
})
