import type { TxOrDb } from "@/storage/db"
import { SyncEvent } from "@/sync"
import * as Session from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { Log } from "@ravens-ai/core/util/log"
import { eq } from "drizzle-orm"
import { MessageTable } from "@/session/session.sql"

const log = Log.create({ service: "search.projector" })

function escapeFtsContent(text: string): string {
  return text.replace(/[\x00-\x1f]/g, " ").trim()
}

function extractText(part: MessageV2.Part): { type: string; content: string } | null {
  switch (part.type) {
    case "text":
      return part.text ? { type: "text", content: part.text } : null
    case "reasoning":
      return part.text ? { type: "reasoning", content: part.text } : null
    case "tool":
      return part.tool ? { type: "tool", content: part.tool } : null
    case "file":
      return part.filename ? { type: "file", content: part.filename } : null
    default:
      return null
  }
}

function getMessageRole(db: TxOrDb, messageID: string): string | null {
  const row = db
    .select({ data: MessageTable.data })
    .from(MessageTable)
    .where(eq(MessageTable.id, messageID as any))
    .get()
  if (!row) return null
  const data = row.data as { role?: string }
  return data.role || null
}

function indexPart(db: TxOrDb, sessionID: string, part: MessageV2.Part, timeCreated: number) {
  const extracted = extractText(part)
  if (!extracted || !extracted.content) return

  const role = getMessageRole(db, part.messageID)
  const content = escapeFtsContent(extracted.content)

  if (!content) return

  const client = (db as unknown as { $client?: { query: (sql: string) => { run: (...params: any[]) => void } } }).$client
  if (!client) return

  try {
    // Delete old entry if exists, then insert
    client.query("DELETE FROM search_index WHERE part_id = ?").run(part.id)
    client
      .query(
        "INSERT INTO search_index (session_id, part_id, message_id, type, role, content, time_created) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(sessionID, part.id, part.messageID, extracted.type, role || null, content, timeCreated)
    // Rebuild the FTS index incrementally
    client.query("INSERT INTO search_index(search_index) VALUES('rebuild')").run()
  } catch (err) {
    log.warn("failed to index part", { partID: part.id, error: String(err) })
  }
}

function unindexPart(db: TxOrDb, partID: string) {
  const client = (db as unknown as { $client?: { query: (sql: string) => { run: (...params: any[]) => void } } }).$client
  if (!client) return

  try {
    client.query("DELETE FROM search_index WHERE part_id = ?").run(partID)
    client.query("INSERT INTO search_index(search_index) VALUES('rebuild')").run()
  } catch (err) {
    log.warn("failed to unindex part", { partID, error: String(err) })
  }
}

function unindexSession(db: TxOrDb, sessionID: string) {
  const client = (db as unknown as { $client?: { query: (sql: string) => { run: (...params: any[]) => void } } }).$client
  if (!client) return

  try {
    client.query("DELETE FROM search_index WHERE session_id = ?").run(sessionID)
    client.query("INSERT INTO search_index(search_index) VALUES('rebuild')").run()
  } catch (err) {
    log.warn("failed to unindex session", { sessionID, error: String(err) })
  }
}

export default [
  SyncEvent.project(MessageV2.Event.PartUpdated, (db, data) => {
    indexPart(db, data.part.sessionID, data.part as MessageV2.Part, data.time)
  }),

  SyncEvent.project(MessageV2.Event.PartRemoved, (db, data) => {
    unindexPart(db, data.partID)
  }),

  SyncEvent.project(Session.Event.Deleted, (db, data) => {
    unindexSession(db, data.sessionID)
  }),
]
