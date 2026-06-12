import { Schema } from "effect"
import { Identifier } from "@/id/id"
import { withStatics } from "@ravens-ai/core/schema"

const memoryIdSchema = Schema.String.check(Schema.isStartsWith("mem_")).pipe(Schema.brand("MemoryID"))

export type MemoryID = typeof memoryIdSchema.Type

export const MemoryID = memoryIdSchema.pipe(
  withStatics((schema: typeof memoryIdSchema) => ({
    ascending: (id?: string) => schema.make(Identifier.ascending("memory", id)),
  })),
)

export const MemoryCategory = Schema.Literals(["user", "project", "feedback", "reference"])
export type MemoryCategory = Schema.Schema.Type<typeof MemoryCategory>

export const MemoryEntry = Schema.Struct({
  id: MemoryID,
  category: MemoryCategory,
  title: Schema.String,
  content: Schema.String,
  tags: Schema.Array(Schema.String),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
})
export type MemoryEntry = Schema.Schema.Type<typeof MemoryEntry>

export const MemoryFile = Schema.Struct({
  version: Schema.Literal("1"),
  entries: Schema.Array(MemoryEntry),
})
export type MemoryFile = Schema.Schema.Type<typeof MemoryFile>

export const MemoryContext = Schema.Struct({
  user: Schema.String,
  project: Schema.String,
  feedback: Schema.String,
  reference: Schema.String,
  totalTokens: Schema.Number,
})
export type MemoryContext = Schema.Schema.Type<typeof MemoryContext>

export const SaveInput = Schema.Struct({
  category: MemoryCategory,
  content: Schema.String,
  title: Schema.String,
  tags: Schema.optional(Schema.Array(Schema.String)),
})
export type SaveInput = Schema.Schema.Type<typeof SaveInput>

export const SearchInput = Schema.Struct({
  query: Schema.String,
  category: Schema.optional(MemoryCategory),
})
export type SearchInput = Schema.Schema.Type<typeof SearchInput>

export * as MemorySchema from "./schema"
