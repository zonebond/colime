import { Schema } from "effect"
import { NonNegativeInt } from "@ravens-ai/core/schema"

export const SearchQuery = Schema.Struct({
  q: Schema.String,
  limit: Schema.optional(Schema.Number),
})

export const SearchResult = Schema.Struct({
  sessionID: Schema.String,
  partID: Schema.String,
  messageID: Schema.String,
  type: Schema.Literals(["text", "reasoning", "tool", "title"]),
  role: Schema.optional(Schema.Literals(["user", "assistant"])),
  snippet: Schema.String,
  rank: Schema.Number,
  sessionTitle: Schema.String,
  timeCreated: NonNegativeInt,
}).annotate({ identifier: "SearchResult" })

export type SearchResult = typeof SearchResult.Type
