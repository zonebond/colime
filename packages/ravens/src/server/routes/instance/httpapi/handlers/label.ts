import { Label } from "@/label/label"
import { LabelID } from "@/label/schema"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"

export const labelHandlers = HttpApiBuilder.group(InstanceHttpApi, "label", (handlers) =>
  Effect.gen(function* () {
    const svc = yield* Label.Service

    const list = Effect.fn("LabelHttpApi.list")(function* () {
      return yield* svc.list()
    })

    const create = Effect.fn("LabelHttpApi.create")(function* (ctx: {
      payload: typeof Label.CreateInput.Type
    }) {
      return yield* svc.create(ctx.payload)
    })

    const update = Effect.fn("LabelHttpApi.update")(function* (ctx: {
      params: { labelID: LabelID }
      payload: typeof Label.UpdateInput.Type
    }) {
      if (ctx.payload.pinned !== undefined) {
        yield* svc.setPinned({ labelID: ctx.params.labelID, pinned: ctx.payload.pinned })
      }
      return yield* svc.update(ctx.params.labelID, ctx.payload)
    })

    const remove = Effect.fn("LabelHttpApi.remove")(function* (ctx: {
      params: { labelID: LabelID }
    }) {
      yield* svc.remove(ctx.params.labelID)
      return true
    })

    return handlers
      .handle("list", list)
      .handle("create", create)
      .handle("update", update)
      .handle("remove", remove)
  }),
)
