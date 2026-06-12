import { Effect, Schema } from "effect"
import * as Tool from "@/tool/tool"
import { MemoryID } from "@/memory/schema"
import { Memory } from "@/memory/memory"
import DESCRIPTION from "./memory-save.txt"

const Parameters = Schema.Struct({
  category: Schema.Literals(["user", "project", "feedback", "reference"]).annotate({
    description: "Type of memory to save",
  }),
  content: Schema.String.annotate({
    description: "The information to remember, concise and factual",
  }),
  title: Schema.String.annotate({
    description: "Short title for this memory entry",
  }),
  tags: Schema.optional(
    Schema.Array(Schema.String).annotate({ description: "Optional tags for search" }),
  ),
})

export const MemorySaveTool = Tool.define("memory_save", Effect.gen(function* () {
  const memory = yield* Memory.Service

  return {
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (args, ctx) =>
      Effect.gen(function* () {
        const entry = yield* memory.save({
          category: args.category,
          content: args.content,
          title: args.title,
          tags: args.tags,
        })
        return {
          title: `Memory saved: ${args.category}`,
          metadata: { id: entry.id, category: entry.category },
          output: `Memory saved as [${entry.category}] "${entry.title}" (id: ${entry.id})`,
        }
      }),
  }
}))
