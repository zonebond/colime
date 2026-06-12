import { Document } from "@/document/document"
import { DocumentID } from "@/document/schema"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { notFound } from "../errors"

export const documentHandlers = HttpApiBuilder.group(InstanceHttpApi, "document", (handlers) =>
  Effect.gen(function* () {
    const svc = yield* Document.Service

    const list = Effect.fn("DocumentHttpApi.list")(function* () {
      return yield* svc.list()
    })

    const get = Effect.fn("DocumentHttpApi.get")(function* (ctx: {
      params: { documentID: DocumentID }
    }) {
      const doc = yield* svc.get(ctx.params.documentID)
      if (!doc) return yield* Effect.fail(notFound(`Document not found: ${ctx.params.documentID}`))
      return doc
    })

    const create = Effect.fn("DocumentHttpApi.create")(function* (ctx: {
      payload: typeof Document.CreateInput.Type
    }) {
      return yield* svc.create(ctx.payload)
    })

    const update = Effect.fn("DocumentHttpApi.update")(function* (ctx: {
      params: { documentID: DocumentID }
      payload: typeof Document.UpdateInput.Type
    }) {
      return yield* svc.update(ctx.params.documentID, ctx.payload)
    })

    const remove = Effect.fn("DocumentHttpApi.remove")(function* (ctx: {
      params: { documentID: DocumentID }
    }) {
      yield* svc.remove(ctx.params.documentID)
      return true
    })

    return handlers
      .handle("list", list)
      .handle("get", get)
      .handle("create", create)
      .handle("update", update)
      .handle("remove", remove)
  }),
)
