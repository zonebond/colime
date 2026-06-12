import { Effect, Schema } from "effect"
import * as Tool from "@/tool/tool"
import { Memory } from "@/memory/memory"

const Parameters = Schema.Struct({
  query: Schema.String.annotate({
    description: "Search query to find relevant memories",
  }),
  category: Schema.optional(
    Schema.Literals(["user", "project", "feedback", "reference"]).annotate({
      description: "Filter by memory category",
    }),
  ),
})

export const MemorySearchTool = Tool.define("memory_search", Effect.gen(function* () {
  const memory = yield* Memory.Service

  return {
    description: `Search persistent memory for relevant context from previous sessions.

Use this tool when you need to recall past decisions, user preferences, or important patterns.`,
    parameters: Parameters,
    execute: (args, ctx) =>
      Effect.gen(function* () {
        const results = yield* memory.search({
          query: args.query,
          category: args.category,
        })

        if (results.length === 0) {
          return {
            title: "No memories found",
            metadata: {},
            output: "No memories found matching your query.",
          }
        }

        const formatted = results
          .map(
            (e) =>
              `[${e.category}] [${new Date(e.updatedAt).toISOString().slice(0, 10)}] ${e.title || "Untitled"}: ${e.content}`,
          )
          .join("\n")

        return {
          title: `Found ${results.length} memories`,
          metadata: { count: results.length },
          output: `Found ${results.length} memories:\n${formatted}`,
        }
      }),
  }
}))
