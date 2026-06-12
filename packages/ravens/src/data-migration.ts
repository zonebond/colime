import { Context, Effect, Layer } from "effect"
import { Database } from "./storage/db"
import { DataMigrationTable } from "./data-migration.sql"
import * as Log from "@ravens-ai/core/util/log"
import { and, asc, eq, gt, inArray, sql } from "drizzle-orm"
import { MessageTable, SessionTable } from "./session/session.sql"
import type { SessionID } from "./session/schema"

export type Migration<R = never> = {
  name: string
  run: Effect.Effect<void, unknown, R>
}

const log = Log.create({ service: "data-migration" })

export interface Interface {}

export class Service extends Context.Service<Service, Interface>()("@ravens/DataMigration") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const migrations: Migration[] = [
      {
        name: "search_index_backfill",
        run: Effect.gen(function* () {
          yield* Effect.sync(() =>
            Database.use((db) => {
              const client = (db as any).$client
              if (!client) return

              // Index from PartTable joined with MessageTable for role
              const rows = client
                .query(
                  `SELECT p.id as part_id, p.session_id, p.message_id, p.data, p.time_created,
                          m.data as msg_data
                   FROM part p
                   LEFT JOIN message m ON m.id = p.message_id
                   ORDER BY p.time_created`,
                )
                .all() as {
                part_id: string
                session_id: string
                message_id: string
                data: string
                time_created: number
                msg_data: string | null
              }[]

              for (const row of rows) {
                let part: any
                let msg: any
                try {
                  part = typeof row.data === "string" ? JSON.parse(row.data) : row.data
                  msg = row.msg_data ? (typeof row.msg_data === "string" ? JSON.parse(row.msg_data) : row.msg_data) : null
                } catch {
                  continue
                }

                const role = msg?.role || null
                if (role && !["user", "assistant"].includes(role)) continue

                let type: string | null = null
                let content: string | null = null

                if (part.type === "text" && part.text) {
                  type = "text"
                  content = part.text
                } else if (part.type === "reasoning" && part.text) {
                  type = "reasoning"
                  content = part.text
                } else if (part.type === "tool" && part.tool) {
                  type = "tool"
                  content = part.tool
                } else if (part.type === "file" && part.filename) {
                  type = "file"
                  content = part.filename
                }

                if (!type || !content) continue

                const cleanContent = content.replace(/[\x00-\x1f]/g, " ").trim()
                if (!cleanContent) continue

                try {
                  client
                    .query(
                      "INSERT OR REPLACE INTO search_index (session_id, part_id, message_id, type, role, content, time_created) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    )
                    .run(row.session_id, row.part_id, row.message_id, type, role, cleanContent, row.time_created)
                } catch {
                  // skip duplicates
                }
              }

              // Index session titles
              const sessions = client.query("SELECT id, title FROM session").all() as {
                id: string
                title: string
              }[]
              for (const session of sessions) {
                const cleanTitle = session.title.replace(/[\x00-\x1f]/g, " ").trim()
                if (!cleanTitle) continue
                try {
                  client
                    .query(
                      "INSERT OR REPLACE INTO search_index (session_id, part_id, message_id, type, role, content, time_created) VALUES (?, ?, ?, 'title', NULL, ?, 0)",
                    )
                    .run(session.id, `title_${session.id}`, "", cleanTitle)
                } catch {
                  // skip
                }
              }

              client.query("INSERT INTO search_index(search_index) VALUES('rebuild')").run()
            }),
          )
        }),
      },
      {
        name: "session_usage_from_messages",
        run: Effect.gen(function* () {
          type Usage = {
            cost: number
            tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
          }

          for (let cursor: SessionID | undefined, page = 1; ; page++) {
            const next = yield* Effect.gen(function* () {
              const sessions = yield* Effect.sync(() =>
                Database.use((db) =>
                  db
                    .select({ id: SessionTable.id })
                    .from(SessionTable)
                    .where(cursor ? gt(SessionTable.id, cursor) : undefined)
                    .orderBy(asc(SessionTable.id))
                    .limit(100)
                    .all(),
                ),
              )
              if (sessions.length === 0) return

              yield* Effect.sync(() =>
                Database.transaction((db) => {
                  const usageBySession = new Map<SessionID, Usage>(
                    sessions.map((session) => [
                      session.id,
                      { cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } },
                    ]),
                  )

                  for (const row of db
                    .select({
                      session_id: MessageTable.session_id,
                      cost: sql<number>`coalesce(sum(coalesce(json_extract(${MessageTable.data}, '$.cost'), 0)), 0)`,
                      tokens_input: sql<number>`coalesce(sum(coalesce(json_extract(${MessageTable.data}, '$.tokens.input'), 0)), 0)`,
                      tokens_output: sql<number>`coalesce(sum(coalesce(json_extract(${MessageTable.data}, '$.tokens.output'), 0)), 0)`,
                      tokens_reasoning: sql<number>`coalesce(sum(coalesce(json_extract(${MessageTable.data}, '$.tokens.reasoning'), 0)), 0)`,
                      tokens_cache_read: sql<number>`coalesce(sum(coalesce(json_extract(${MessageTable.data}, '$.tokens.cache.read'), 0)), 0)`,
                      tokens_cache_write: sql<number>`coalesce(sum(coalesce(json_extract(${MessageTable.data}, '$.tokens.cache.write'), 0)), 0)`,
                    })
                    .from(MessageTable)
                    .where(
                      and(
                        inArray(
                          MessageTable.session_id,
                          sessions.map((session) => session.id),
                        ),
                        sql`json_extract(${MessageTable.data}, '$.role') = 'assistant'`,
                      ),
                    )
                    .groupBy(MessageTable.session_id)
                    .all()) {
                    const current = usageBySession.get(row.session_id)
                    if (!current) continue
                    current.cost = row.cost
                    current.tokens.input = row.tokens_input
                    current.tokens.output = row.tokens_output
                    current.tokens.reasoning = row.tokens_reasoning
                    current.tokens.cache.read = row.tokens_cache_read
                    current.tokens.cache.write = row.tokens_cache_write
                  }

                  for (const [sessionID, value] of usageBySession) {
                    db.update(SessionTable)
                      .set({
                        cost: value.cost,
                        tokens_input: value.tokens.input,
                        tokens_output: value.tokens.output,
                        tokens_reasoning: value.tokens.reasoning,
                        tokens_cache_read: value.tokens.cache.read,
                        tokens_cache_write: value.tokens.cache.write,
                        time_updated: sql`${SessionTable.time_updated}`,
                      })
                      .where(eq(SessionTable.id, sessionID))
                      .run()
                  }
                }),
              )

              return sessions.at(-1)?.id
            }).pipe(
              Effect.withSpan("DataMigration.sessionUsage.page", {
                attributes: {
                  "data_migration.name": "session_usage_from_messages",
                  "data_migration.page": page,
                  "data_migration.cursor": cursor ?? "",
                },
              }),
            )
            if (!next) return
            cursor = next
            yield* Effect.sleep("10 millis")
          }
        }),
      },
      {
        name: "session_pinned_column",
        run: Effect.gen(function* () {
          yield* Effect.sync(() =>
            Database.use((db) => {
              const client = (db as any).$client
              if (!client) return
              client.query("ALTER TABLE session ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0").run()
            }),
          )
        }),
      },
      {
        name: "label_pinned_column",
        run: Effect.gen(function* () {
          yield* Effect.sync(() =>
            Database.use((db) => {
              const client = (db as any).$client
              if (!client) return
              client.query("ALTER TABLE label ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0").run()
            }),
          )
        }),
      },
      {
        name: "label_description_column",
        run: Effect.gen(function* () {
          yield* Effect.sync(() =>
            Database.use((db) => {
              const client = (db as any).$client
              if (!client) return
              client.query("ALTER TABLE label ADD COLUMN description TEXT NOT NULL DEFAULT ''").run()
            }),
          )
        }),
      },
    ]

    yield* Effect.gen(function* () {
      if (migrations.length === 0) return

      // Migrations run in a background fiber, so they must be resumable until
      // their completion row is written.
      for (const migration of migrations) {
        const completed = Database.use((db) =>
          db
            .select({ name: DataMigrationTable.name })
            .from(DataMigrationTable)
            .where(eq(DataMigrationTable.name, migration.name))
            .get(),
        )
        if (completed) continue

        log.info("running data migration", { name: migration.name })
        yield* migration.run.pipe(Effect.withSpan("DataMigration", { attributes: { name: migration.name } }))
        Database.use((db) =>
          db
            .insert(DataMigrationTable)
            .values({ name: migration.name, time_completed: Date.now() })
            .onConflictDoNothing()
            .run(),
        )
      }
    }).pipe(
      Effect.tapCause((cause) =>
        Effect.logError("failed to run data migrations").pipe(Effect.annotateLogs("cause", cause)),
      ),
      Effect.ignore,
      Effect.forkScoped,
    )
    return Service.of({})
  }),
)

export const defaultLayer = layer

export * as DataMigration from "./data-migration"
