import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import * as MemorySchema from "@/memory/schema"

describe("Memory Schema", () => {
  test("MemoryCategory accepts valid categories", () => {
    for (const cat of ["user", "project", "feedback", "reference"] as const) {
      const result = Schema.decodeUnknownSync(MemorySchema.MemoryCategory)(cat)
      expect(result).toBe(cat)
    }
  })

  test("MemoryCategory rejects invalid categories", () => {
    expect(() => Schema.decodeUnknownSync(MemorySchema.MemoryCategory)("invalid")).toThrow()
  })

  test("MemoryID generates ascending IDs", () => {
    const id = MemorySchema.MemoryID.ascending()
    expect(id).toContain("mem_")
  })

  test("MemoryEntry has required fields", () => {
    const entry = {
      id: MemorySchema.MemoryID.ascending(),
      category: "user" as MemorySchema.MemoryCategory,
      title: "Test preference",
      content: "I prefer pnpm",
      tags: ["package-manager"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    expect(entry.id).toContain("mem_")
    expect(entry.category).toBe("user")
    expect(entry.content).toBe("I prefer pnpm")
  })

  test("SaveInput works with and without tags", () => {
    const withTags: MemorySchema.SaveInput = {
      category: "project" as MemorySchema.MemoryCategory,
      content: "Use Redis for caching",
      title: "Cache decision",
      tags: ["architecture"],
    }
    const withoutTags: MemorySchema.SaveInput = {
      category: "user" as MemorySchema.MemoryCategory,
      content: "I like functional style",
      title: "Style preference",
    }
    expect(withTags.tags).toEqual(["architecture"])
    expect(withoutTags.tags).toBeUndefined()
  })

  test("SearchInput works with and without category", () => {
    const withCategory: MemorySchema.SearchInput = {
      query: "database",
      category: "project" as MemorySchema.MemoryCategory,
    }
    const withoutCategory: MemorySchema.SearchInput = {
      query: "preference",
    }
    expect(withCategory.category).toBe("project")
    expect(withoutCategory.category).toBeUndefined()
  })

  test("MemoryContext has all fields", () => {
    const ctx: MemorySchema.MemoryContext = {
      user: "I prefer pnpm",
      project: "Use Redis for caching",
      feedback: "Don't modify auth",
      reference: "DB schema in prisma/",
      totalTokens: 2000,
    }
    expect(ctx.totalTokens).toBe(2000)
  })
})
