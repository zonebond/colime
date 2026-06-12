import { Context, Effect, Layer } from "effect"
import * as Schema from "./schema"
import { MemoryID } from "./schema"
import * as Store from "./store"

const TOKEN_BUDGET_USER = 500
const TOKEN_BUDGET_PROJECT = 800
const TOKEN_BUDGET_FEEDBACK = 400
const TOKEN_BUDGET_REFERENCE = 300
const CHARS_PER_TOKEN = 4

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function trimToBudget(text: string, budget: number): string {
  const tokens = estimateTokens(text)
  if (tokens <= budget) return text
  const maxChars = budget * CHARS_PER_TOKEN
  return text.slice(0, maxChars) + "\n... (truncated)"
}

export interface Interface {
  readonly load: (budget: number) => Effect.Effect<Schema.MemoryContext>
  readonly save: (input: Schema.SaveInput) => Effect.Effect<Schema.MemoryEntry>
  readonly search: (input: Schema.SearchInput) => Effect.Effect<Schema.MemoryEntry[]>
  readonly remove: (id: Schema.MemoryID, category: Schema.MemoryCategory) => Effect.Effect<void>
  readonly refresh: Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@ravens/Memory") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const store = yield* Store.Service

    const load = (budget: number): Effect.Effect<Schema.MemoryContext> =>
      Effect.gen(function* () {
        const userEntries = yield* store.read("user")
        const projectEntries = yield* store.read("project").pipe(Effect.catchCause(() => Effect.succeed([])))
        const feedbackEntries = yield* store.read("feedback").pipe(Effect.catchCause(() => Effect.succeed([])))
        const referenceEntries = yield* store.read("reference").pipe(Effect.catchCause(() => Effect.succeed([])))

        const formatEntries = (entries: Schema.MemoryEntry[]) =>
          entries.map((e) => `- [${new Date(e.updatedAt).toISOString().slice(0, 10)}] ${e.content}`).join("\n")

        let remainingBudget = budget

        const user = formatEntries(userEntries)
        const userBudget = Math.min(TOKEN_BUDGET_USER, remainingBudget)
        remainingBudget -= userBudget
        const userText = trimToBudget(user, userBudget)

        const project = formatEntries(projectEntries)
        const projectBudget = Math.min(TOKEN_BUDGET_PROJECT, remainingBudget)
        remainingBudget -= projectBudget
        const projectText = trimToBudget(project, projectBudget)

        const feedback = formatEntries(feedbackEntries)
        const feedbackBudget = Math.min(TOKEN_BUDGET_FEEDBACK, remainingBudget)
        remainingBudget -= feedbackBudget
        const feedbackText = trimToBudget(feedback, feedbackBudget)

        const reference = formatEntries(referenceEntries)
        const referenceBudget = Math.min(TOKEN_BUDGET_REFERENCE, remainingBudget)
        const referenceText = trimToBudget(reference, referenceBudget)

        const totalTokens =
          estimateTokens(userText) +
          estimateTokens(projectText) +
          estimateTokens(feedbackText) +
          estimateTokens(referenceText)

        return Schema.MemoryContext.make({
          user: userText,
          project: projectText,
          feedback: feedbackText,
          reference: referenceText,
          totalTokens,
        })
      })

    const save = (input: Schema.SaveInput): Effect.Effect<Schema.MemoryEntry> =>
      Effect.gen(function* () {
        const now = Date.now()
        const entry: Schema.MemoryEntry = {
          id: MemoryID.ascending(),
          category: input.category,
          title: input.title,
          content: input.content,
          tags: input.tags ?? [],
          createdAt: now,
          updatedAt: now,
        }
        yield* store.append(input.category, entry)
        return entry
      })

    const search = (input: Schema.SearchInput): Effect.Effect<Schema.MemoryEntry[]> =>
      Effect.gen(function* () {
        const categories: Schema.MemoryCategory[] = input.category
          ? [input.category]
          : ["user", "project", "feedback", "reference"]

        const allEntries: Schema.MemoryEntry[] = []
        for (const category of categories) {
          const entries = yield* store.read(category).pipe(Effect.catchCause(() => Effect.succeed([])))
          allEntries.push(...entries)
        }

        const query = input.query.toLowerCase()
        return allEntries.filter(
          (e) =>
            e.content.toLowerCase().includes(query) ||
            e.title.toLowerCase().includes(query) ||
            e.tags.some((t) => t.toLowerCase().includes(query)),
        )
      })

    const remove = (id: Schema.MemoryID, category: Schema.MemoryCategory): Effect.Effect<void> =>
      store.remove(category, id)

    const refresh: Effect.Effect<void> = Effect.unit

    return Service.of({ load, save, search, remove, refresh })
  }),
)

export const defaultLayer = layer.pipe(Layer.provide(Store.defaultLayer))

export * as Memory from "./memory"
