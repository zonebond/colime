import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"
import * as Search from "@/search/schema"

const root = "/search"

export const SearchApi = HttpApi.make("search")
  .add(
    HttpApiGroup.make("search")
      .add(
        HttpApiEndpoint.get("search", root, {
          query: Schema.Struct({
            q: Schema.String,
            limit: Schema.optional(Schema.Number),
            ...WorkspaceRoutingQuery.fields,
          }),
          success: described(Schema.Array(Search.SearchResult), "Search results"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "search.content",
            summary: "Full-text search across session content",
            description:
              "Search messages, reasoning traces, and tool calls using FTS5. Returns matching parts with snippets.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "search",
          description: "Content search routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "ravens search HttpApi",
      version: "0.0.1",
      description: "Full-text content search.",
    }),
  )
