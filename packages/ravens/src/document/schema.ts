import { Schema } from "effect"
import { withStatics } from "@ravens-ai/core/schema"

const documentIdSchema = Schema.String.pipe(Schema.brand("DocumentID"))

export type DocumentID = typeof documentIdSchema.Type

export const DocumentID = documentIdSchema.pipe(
  withStatics((schema: typeof documentIdSchema) => {
    const make = schema.make.bind(schema)
    return {
      make: (input?: string) => make(input ?? `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
    }
  }),
)
