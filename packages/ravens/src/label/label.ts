import { eq, inArray } from "drizzle-orm"
import { Database } from "@/storage/db"
import { LabelTable, SessionLabelTable } from "./label.sql"
import { LabelID } from "./schema"
import type { SessionID } from "../session/schema"
import { BusEvent } from "@/bus/bus-event"
import { GlobalBus } from "@/bus/global"
import { Effect, Layer, Context, Schema } from "effect"
import { NonNegativeInt } from "@ravens-ai/core/schema"
import { serviceUse } from "@/effect/service-use"

// ── Types ──────────────────────────────────────────────────────────────────

const LabelTime = Schema.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
})

export const Info = Schema.Struct({
  id: LabelID,
  name: Schema.String,
  description: Schema.String,
  time: LabelTime,
  pinned: Schema.optional(Schema.Boolean),
  sessionCount: Schema.optional(Schema.Number),
}).annotate({ identifier: "Label" })
export type Info = typeof Info.Type

export const CreateInput = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
})
export type CreateInput = typeof CreateInput.Type

export const UpdateInput = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  pinned: Schema.optional(Schema.Boolean),
})
export type UpdateInput = typeof UpdateInput.Type

export const Event = {
  Updated: BusEvent.define("label.updated", Info),
  Deleted: BusEvent.define("label.deleted", Schema.Struct({ id: LabelID })),
}

type LabelRow = typeof LabelTable.$inferSelect
function fromRow(row: LabelRow, sessionCount?: number): Info {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    time: {
      created: row.time_created,
      updated: row.time_updated,
    },
    pinned: row.pinned === 1 ? true : undefined,
    ...(sessionCount !== undefined ? { sessionCount } : {}),
  }
}

// ── Service interface ──────────────────────────────────────────────────────

export interface Interface {
  readonly list: () => Effect.Effect<Info[]>
  readonly get: (id: LabelID) => Effect.Effect<Info | undefined>
  readonly create: (input: CreateInput) => Effect.Effect<Info>
  readonly update: (id: LabelID, input: UpdateInput) => Effect.Effect<Info>
  readonly remove: (id: LabelID) => Effect.Effect<void>
  readonly setPinned: (input: { labelID: LabelID; pinned: boolean }) => Effect.Effect<void>
  readonly setSessionLabel: (sessionID: SessionID, labelID: LabelID | null) => Effect.Effect<void>
  readonly getSessionLabel: (sessionID: SessionID) => Effect.Effect<Info | undefined>
  readonly getSessionLabels: (sessionIDs: SessionID[]) => Effect.Effect<Map<string, { labelId: string; labelName: string }>>
}

export class Service extends Context.Service<Service, Interface>()("@ravens/Label") {}

// ── Layer ──────────────────────────────────────────────────────────────────

export const layer: Layer.Layer<Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = <T>(fn: (d: Parameters<typeof Database.use>[0] extends (trx: infer D) => any ? D : never) => T) =>
      Effect.sync(() => Database.use(fn))

    const emitUpdated = (data: Info) =>
      Effect.sync(() =>
        GlobalBus.emit("event", {
          directory: "global",
          payload: { type: Event.Updated.type, properties: data },
        }),
      )

    const emitDeleted = (id: LabelID) =>
      Effect.sync(() =>
        GlobalBus.emit("event", {
          directory: "global",
          payload: { type: Event.Deleted.type, properties: { id } },
        }),
      )

    const list = Effect.fn("Label.list")(function* () {
      const labels = yield* db((d) => d.select().from(LabelTable).all())
      const sessionCounts = yield* db((d) =>
        d.select().from(SessionLabelTable).all(),
      )
      const countByLabel = new Map<string, number>()
      for (const sl of sessionCounts) {
        countByLabel.set(sl.label_id, (countByLabel.get(sl.label_id) ?? 0) + 1)
      }

      return labels
        .map((row) => fromRow(row, countByLabel.get(row.id) ?? 0))
        .sort((a, b) => a.time.updated - b.time.updated)
    })

    const get = Effect.fn("Label.get")(function* (id: LabelID) {
      const row = yield* db((d) =>
        d.select().from(LabelTable).where(eq(LabelTable.id, id)).get(),
      )
      if (!row) return undefined
      const count = yield* db((d) =>
        d
          .select()
          .from(SessionLabelTable)
          .where(eq(SessionLabelTable.label_id, id))
          .all(),
      )
      return fromRow(row, count.length)
    })

    const create = Effect.fn("Label.create")(function* (input: CreateInput) {
      const result: Info = {
        id: LabelID.make(),
        name: input.name,
        description: input.description ?? "",
        time: { created: Date.now(), updated: Date.now() },
      }
      yield* db((d) =>
        d
          .insert(LabelTable)
          .values({
            id: result.id,
            name: result.name,
            description: result.description,
            time_created: result.time.created,
            time_updated: result.time.updated,
          })
          .run(),
      )
      yield* emitUpdated(result)
      return result
    })

    const update = Effect.fn("Label.update")(function* (id: LabelID, input: UpdateInput) {
      const row = yield* db((d) =>
        d.select().from(LabelTable).where(eq(LabelTable.id, id)).get(),
      )
      if (!row) throw new Error(`Label not found: ${id}`)
      const now = Date.now()
      const values = {
        name: input.name ?? row.name,
        description: input.description !== undefined ? input.description : row.description,
        pinned: input.pinned !== undefined ? (input.pinned ? 1 : 0) : row.pinned,
        time_updated: now,
      }
      yield* db((d) =>
        d.update(LabelTable).set(values).where(eq(LabelTable.id, id)).run(),
      )
      const result = fromRow({ ...row, ...values, time_created: row.time_created }, undefined)
      yield* emitUpdated(result)
      return result
    })

    const setPinned = Effect.fn("Label.setPinned")(function* (input: { labelID: LabelID; pinned: boolean }) {
      yield* db((d) =>
        d.update(LabelTable).set({ pinned: input.pinned ? 1 : 0 }).where(eq(LabelTable.id, input.labelID)).run(),
      )
    })

    const remove = Effect.fn("Label.remove")(function* (id: LabelID) {
      // session_label rows cascade-delete via FK
      yield* db((d) => d.delete(LabelTable).where(eq(LabelTable.id, id)).run())
      yield* emitDeleted(id)
    })

    const setSessionLabel = Effect.fn("Label.setSessionLabel")(function* (
      sessionID: SessionID,
      labelID: LabelID | null,
    ) {
      // Remove existing
      yield* db((d) =>
        d.delete(SessionLabelTable).where(eq(SessionLabelTable.session_id, sessionID)).run(),
      )
      if (labelID !== null) {
        const now = Date.now()
        yield* db((d) =>
          d
            .insert(SessionLabelTable)
            .values({
              session_id: sessionID,
              label_id: labelID,
              time_created: now,
              time_updated: now,
            })
            .run(),
        )
      }
    })

    const getSessionLabel = Effect.fn("Label.getSessionLabel")(function* (sessionID: SessionID) {
      const row = yield* db((d) =>
        d
          .select()
          .from(SessionLabelTable)
          .where(eq(SessionLabelTable.session_id, sessionID))
          .get(),
      )
      if (!row) return undefined
      return yield* get(row.label_id)
    })

    const getSessionLabels = Effect.fn("Label.getSessionLabels")(function* (
      sessionIDs: SessionID[],
    ) {
      const rows = yield* db((d) =>
        d
          .select()
          .from(SessionLabelTable)
          .where(inArray(SessionLabelTable.session_id, sessionIDs))
          .all(),
      )
      const labelIds = [...new Set(rows.map((r) => r.label_id))]
      const labelRows = yield* db((d) =>
        d.select().from(LabelTable).where(inArray(LabelTable.id, labelIds)).all(),
      )
      const labelMap = new Map(labelRows.map((r) => [r.id, r.name]))
      const result = new Map<string, { labelId: string; labelName: string }>()
      for (const row of rows) {
        result.set(row.session_id, {
          labelId: row.label_id,
          labelName: labelMap.get(row.label_id) ?? row.label_id,
        })
      }
      return result
    })

    return Service.of({
      list,
      get,
      create,
      update,
      remove,
      setPinned,
      setSessionLabel,
      getSessionLabel,
      getSessionLabels,
    })
  }),
)

export const defaultLayer = layer

export const use = serviceUse(Service)

export function list(): Info[] {
  return Database.use((db) => {
    const labels = db.select().from(LabelTable).all()
    const sessionCounts = db.select().from(SessionLabelTable).all()
    const countByLabel = new Map<string, number>()
    for (const row of sessionCounts) {
      countByLabel.set(row.label_id, (countByLabel.get(row.label_id) ?? 0) + 1)
    }
    return labels
      .map((row) => fromRow(row, countByLabel.get(row.id) ?? 0))
      .sort((a, b) => a.time.updated - b.time.updated)
  })
}

export function get(id: LabelID): Info | undefined {
  const row = Database.use((db) =>
    db.select().from(LabelTable).where(eq(LabelTable.id, id)).get(),
  )
  if (!row) return undefined
  const count = Database.use((db) =>
    db.select().from(SessionLabelTable).where(eq(SessionLabelTable.label_id, id)).all(),
  )
  return fromRow(row, count.length)
}

export * as Label from "./label"
