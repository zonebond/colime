import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"
import type { DocumentID } from "./schema"

export const DocumentTable = sqliteTable("document", {
  id: text().$type<DocumentID>().primaryKey(),
  title: text().notNull(),
  content: text().notNull().default(""),
  type: text().notNull().default("markdown"),
  tags_json: text().notNull().default("[]"),
  ...Timestamps,
})
