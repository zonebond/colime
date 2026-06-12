import { Database } from "@/storage/db"
import { Effect, Layer, Context } from "effect"
import type { SearchResult } from "./schema"
import { inArray } from "drizzle-orm"
import { SessionTable } from "@/session/session.sql"

// ── Service interface ──────────────────────────────────────────────────────

export interface Interface {
  readonly search: (q: string, limit?: number) => Effect.Effect<SearchResult[]>
}

export class Service extends Context.Service<Service, Interface>()("@ravens/Search") {}

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeFts5(query: string): string {
  return query
    .replace(/[\\*_\"'()^\-\[\]{}!:&|><~\.]/g, "")
    .trim()
    .split(/\s+/)
    .join(" AND ")
}

interface FtsRow {
  session_id: string
  part_id: string
  message_id: string
  type: string
  role: string | null
  snippet: string
  rank: number
}

function ftsQuery(q: string, limit: number): SearchResult[] {
  const ftsExpr = escapeFts5(q)
  if (!ftsExpr) return []

  return Database.use((db) => {
    // Access the underlying bun:sqlite Database for FTS5 raw queries
    const client = (db as unknown as { $client?: { query: (sql: string) => { all: (...params: any[]) => any[] } } })
      .$client
    if (!client) return []

    const rows = client
      .query(
        `SELECT session_id, part_id, message_id, type, role,
                snippet(search_index, 5, '<mark>', '</mark>', '…', 32) AS snippet,
                rank
         FROM search_index
         WHERE search_index MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(ftsExpr, limit) as FtsRow[]

    if (!rows || rows.length === 0) return []

    const sessionIDs = [...new Set(rows.map((r) => r.session_id))]
    const titleRows = db
      .select({ id: SessionTable.id, title: SessionTable.title })
      .from(SessionTable)
      .where(inArray(SessionTable.id, sessionIDs as any))
      .all()
    const titleMap = new Map(titleRows.map((r) => [r.id, r.title]))

    return rows.map(
      (row): SearchResult => ({
        sessionID: row.session_id,
        partID: row.part_id,
        messageID: row.message_id,
        type: row.type as SearchResult["type"],
        role: (row.role as SearchResult["role"]) || undefined,
        snippet: row.snippet || "",
        rank: typeof row.rank === "number" ? row.rank : 0,
        sessionTitle: titleMap.get(row.session_id) || "Untitled",
        timeCreated: 0,
      }),
    )
  })
}

// ── Layer ──────────────────────────────────────────────────────────────────

export const layer: Layer.Layer<Service> = Layer.effect(
  Service,
  Effect.sync(() => {
    const search = Effect.fn("Search.search")(function* (q: string, limit = 20) {
      return ftsQuery(q, limit)
    })

    return Service.of({ search })
  }),
)

export const defaultLayer = layer
