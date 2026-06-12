import { Schema } from "effect"
import { withStatics } from "@ravens-ai/core/schema"

const labelIdSchema = Schema.String.pipe(Schema.brand("LabelID"))

export type LabelID = typeof labelIdSchema.Type

export const LabelID = labelIdSchema.pipe(
  withStatics((schema: typeof labelIdSchema) => {
    const make = schema.make.bind(schema)
    return {
      make: (input?: string) => make(input ?? `lbl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
    }
  }),
)
