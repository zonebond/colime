import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { SessionTable } from "../session/session.sql"
import { Timestamps } from "../storage/schema.sql"
import type { LabelID } from "./schema"
import type { SessionID } from "../session/schema"

export const LabelTable = sqliteTable("label", {
  id: text().$type<LabelID>().primaryKey(),
  name: text().notNull(),
  description: text().notNull().default(""),
  pinned: integer().notNull().default(0),
  ...Timestamps,
})

export const SessionLabelTable = sqliteTable(
  "session_label",
  {
    session_id: text()
      .$type<SessionID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    label_id: text()
      .$type<LabelID>()
      .notNull()
      .references(() => LabelTable.id, { onDelete: "cascade" }),
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("session_label_session_idx").on(table.session_id),
    uniqueIndex("session_label_label_session_idx").on(table.label_id, table.session_id),
  ],
)
