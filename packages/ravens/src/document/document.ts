import { eq } from "drizzle-orm"
import { Database } from "@/storage/db"
import { DocumentTable } from "./document.sql"
import { DocumentID } from "./schema"
import { Effect, Layer, Context, Schema } from "effect"
import { NonNegativeInt } from "@ravens-ai/core/schema"
import { serviceUse } from "@/effect/service-use"

// ── Types ──────────────────────────────────────────────────────────────────

const DocumentTime = Schema.Struct({
  created: NonNegativeInt,
  updated: NonNegativeInt,
})

export const Info = Schema.Struct({
  id: DocumentID,
  title: Schema.String,
  content: Schema.String,
  type: Schema.String,
  tags: Schema.Array(Schema.String),
  time: DocumentTime,
}).annotate({ identifier: "Document" })
export type Info = typeof Info.Type

export const CreateInput = Schema.Struct({
  title: Schema.String,
  content: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
})
export type CreateInput = typeof CreateInput.Type

export const UpdateInput = Schema.Struct({
  title: Schema.optional(Schema.String),
  content: Schema.optional(Schema.String),
  type: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
})
export type UpdateInput = typeof UpdateInput.Type

// ── Row mapper ─────────────────────────────────────────────────────────────

type DocumentRow = typeof DocumentTable.$inferSelect
function fromRow(row: DocumentRow): Info {
  let tags: string[] = []
  try {
    const parsed = JSON.parse(row.tags_json)
    if (Array.isArray(parsed)) tags = parsed
  } catch { /* keep empty */ }

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    tags,
    time: {
      created: row.time_created,
      updated: row.time_updated,
    },
  }
}

// ── Service interface ──────────────────────────────────────────────────────

export interface Interface {
  readonly list: () => Effect.Effect<Info[]>
  readonly get: (id: DocumentID) => Effect.Effect<Info | undefined>
  readonly create: (input: CreateInput) => Effect.Effect<Info>
  readonly update: (id: DocumentID, input: UpdateInput) => Effect.Effect<Info>
  readonly remove: (id: DocumentID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@ravens/Document") {}

// ── Layer ──────────────────────────────────────────────────────────────────

export const layer: Layer.Layer<Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = <T>(fn: (d: Parameters<typeof Database.use>[0] extends (trx: infer D) => any ? D : never) => T) =>
      Effect.sync(() => Database.use(fn))

    const list = Effect.fn("Document.list")(function* () {
      const rows = yield* db((d) => d.select().from(DocumentTable).all())
      return rows.map(fromRow).sort((a, b) => b.time.updated - a.time.updated)
    })

    const get = Effect.fn("Document.get")(function* (id: DocumentID) {
      const row = yield* db((d) =>
        d.select().from(DocumentTable).where(eq(DocumentTable.id, id)).get(),
      )
      return row ? fromRow(row) : undefined
    })

    const create = Effect.fn("Document.create")(function* (input: CreateInput) {
      const now = Date.now()
      const result: Info = {
        id: DocumentID.make(),
        title: input.title,
        content: input.content ?? "",
        type: input.type ?? "markdown",
        tags: input.tags ?? [],
        time: { created: now, updated: now },
      }
      yield* db((d) =>
        d
          .insert(DocumentTable)
          .values({
            id: result.id,
            title: result.title,
            content: result.content,
            type: result.type,
            tags_json: JSON.stringify(result.tags),
            time_created: result.time.created,
            time_updated: result.time.updated,
          })
          .run(),
      )
      return result
    })

    const update = Effect.fn("Document.update")(function* (id: DocumentID, input: UpdateInput) {
      const row = yield* db((d) =>
        d.select().from(DocumentTable).where(eq(DocumentTable.id, id)).get(),
      )
      if (!row) throw new Error(`Document not found: ${id}`)

      const now = Date.now()
      const nextTags = input.tags !== undefined ? input.tags : fromRow(row).tags
      const values = {
        title: input.title ?? row.title,
        content: input.content !== undefined ? input.content : row.content,
        type: input.type ?? row.type,
        tags_json: JSON.stringify(nextTags),
        time_updated: now,
      }
      yield* db((d) =>
        d.update(DocumentTable).set(values).where(eq(DocumentTable.id, id)).run(),
      )
      return {
        ...fromRow(row),
        ...values,
        tags: nextTags,
        time: { created: row.time_created, updated: now },
      }
    })

    const remove = Effect.fn("Document.remove")(function* (id: DocumentID) {
      yield* db((d) => d.delete(DocumentTable).where(eq(DocumentTable.id, id)).run())
    })

    return Service.of({ list, get, create, update, remove })
  }),
)

export const defaultLayer = layer

export const use = serviceUse(Service)

export function list(): Info[] {
  return Database.use((db) => {
    const rows = db.select().from(DocumentTable).all()
    return rows.map(fromRow).sort((a, b) => b.time.updated - a.time.updated)
  })
}

export function get(id: DocumentID): Info | undefined {
  const row = Database.use((db) =>
    db.select().from(DocumentTable).where(eq(DocumentTable.id, id)).get(),
  )
  return row ? fromRow(row) : undefined
}

export * as Document from "./document"
