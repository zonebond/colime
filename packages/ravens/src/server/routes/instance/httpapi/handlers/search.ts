import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import * as Search from "@/search/search"

export const searchHandlers = HttpApiBuilder.group(InstanceHttpApi, "search", (handlers) =>
  Effect.gen(function* () {
    const svc = yield* Search.Service

    const search = Effect.fn("SearchHttpApi.search")(function* (ctx: {
      query: { q: string; limit?: number }
    }) {
      return yield* svc.search(ctx.query.q, ctx.query.limit)
    })

    return handlers.handle("search", search)
  }),
)
