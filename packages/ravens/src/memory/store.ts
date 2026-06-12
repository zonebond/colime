import { Effect, Layer, Context } from "effect"
import { AppFileSystem } from "@ravens-ai/core/filesystem"
import { Global } from "@ravens-ai/core/global"
import { InstanceState } from "@/effect/instance-state"
import type { InstanceContext } from "@/project/instance-context"
import * as Schema from "./schema"
import path from "path"

const FILE_VERSION = "1"
const PRODUCT_DIR = "colime"
const MEMORY_DIR = "memory"

export interface Interface {
  readonly read: (category: Schema.MemoryCategory) => Effect.Effect<Schema.MemoryEntry[]>
  readonly write: (category: Schema.MemoryCategory, entries: Schema.MemoryEntry[]) => Effect.Effect<void>
  readonly append: (category: Schema.MemoryCategory, entry: Schema.MemoryEntry) => Effect.Effect<void>
  readonly remove: (category: Schema.MemoryCategory, id: Schema.MemoryID) => Effect.Effect<void>
  readonly path: (category: Schema.MemoryCategory) => Effect.Effect<string>
}

export class Service extends Context.Service<Service, Interface>()("@ravens/MemoryStore") {}

function categoryPath(category: Schema.MemoryCategory): Effect.Effect<string, never, AppFileSystem.Service | Global.Service | InstanceContext> {
  if (category === "user") {
    return Effect.gen(function* () {
      const global = yield* Global.Service
      return path.join(global.config, MEMORY_DIR, "user.md")
    })
  }
  return Effect.gen(function* () {
    const ctx = yield* InstanceState.context
    return path.join(ctx.directory, `.${PRODUCT_DIR}`, MEMORY_DIR, `${category}.md`)
  })
}

function parseFile(content: string, category: Schema.MemoryCategory): Schema.MemoryEntry[] {
  if (!content.trim()) return []

  const entries: Schema.MemoryEntry[] = []
  for (const line of content.split("\n")) {
    const match = line.match(/^-\s*\[(\d{4}-\d{2}-\d{2})\]\s*\[(mem_\w+)\]\s*(.+)$/)
    if (match) {
      entries.push({
        id: match[2] as Schema.MemoryID,
        category,
        title: "",
        content: match[3],
        tags: [],
        createdAt: new Date(match[1]).getTime(),
        updatedAt: new Date(match[1]).getTime(),
      })
    }
  }
  return entries
}

function serializeEntries(entries: Schema.MemoryEntry[]): string {
  const sections = new Map<string, Schema.MemoryEntry[]>()
  for (const entry of entries) {
    const title = entry.title || "General"
    if (!sections.has(title)) sections.set(title, [])
    sections.get(title)!.push(entry)
  }

  let md = `---\nversion: ${FILE_VERSION}\n---\n\n`
  for (const [title, sectionEntries] of sections) {
    md += `## ${title}\n\n`
    for (const entry of sectionEntries) {
      const date = new Date(entry.updatedAt).toISOString().slice(0, 10)
      md += `- [${date}] [${entry.id}] ${entry.content}\n`
    }
    md += "\n"
  }
  return md
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service

    const read = (category: Schema.MemoryCategory): Effect.Effect<Schema.MemoryEntry[]> =>
      Effect.gen(function* () {
        const filePath = yield* categoryPath(category)
        const exists = yield* fs.existsSafe(filePath)
        if (!exists) return []
        const content = yield* fs.readFileString(filePath).pipe(Effect.catch(() => Effect.succeed("")))
        return parseFile(content, category)
      })

    const write = (category: Schema.MemoryCategory, entries: Schema.MemoryEntry[]): Effect.Effect<void> =>
      Effect.gen(function* () {
        const filePath = yield* categoryPath(category)
        yield* fs.ensureDir(path.dirname(filePath))
        yield* fs.writeWithDirs(filePath, serializeEntries(entries))
      })

    const append = (category: Schema.MemoryCategory, entry: Schema.MemoryEntry): Effect.Effect<void> =>
      Effect.gen(function* () {
        const existing = yield* read(category)
        yield* write(category, [...existing, entry])
      })

    const remove = (category: Schema.MemoryCategory, id: Schema.MemoryID): Effect.Effect<void> =>
      Effect.gen(function* () {
        const existing = yield* read(category)
        yield* write(category, existing.filter((e) => e.id !== id))
      })

    const path_ = (category: Schema.MemoryCategory): Effect.Effect<string> => categoryPath(category)

    return Service.of({ read, write, append, remove, path: path_ })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(Global.layer),
)

export * as MemoryStore from "./store"
