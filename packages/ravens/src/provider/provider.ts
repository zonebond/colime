import fuzzysort from "fuzzysort"
import { Config } from "@/config/config"
import { mapValues, mergeDeep, omit, pickBy, sortBy } from "remeda"
import { NoSuchModelError, type Provider as SDK } from "ai"
import * as Log from "@ravens-ai/core/util/log"
import { Npm } from "@ravens-ai/core/npm"
import { Hash } from "@ravens-ai/core/util/hash"
import { type LanguageModelV3 } from "@ai-sdk/provider"
import { Env } from "../env"
import { Flag } from "@ravens-ai/core/flag/flag"
import { NamedError } from "@ravens-ai/core/util/error"
import { iife } from "@/util/iife"
import { Global } from "@ravens-ai/core/global"
import path from "path"
import { pathToFileURL } from "url"
import { Effect, Layer, Context, Schema, Types } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { AppFileSystem } from "@ravens-ai/core/filesystem"
import { isRecord } from "@/util/record"
import { optionalOmitUndefined } from "@ravens-ai/core/schema"

import * as ProviderTransform from "./transform"
import { ModelID, ProviderID } from "./schema"
import { ModelStatus } from "./model-status"
import * as ModelsDev from "./models"

const log = Log.create({ service: "provider" })

function wrapSSE(res: Response, ms: number, ctl: AbortController) {
  if (typeof ms !== "number" || ms <= 0) return res
  if (!res.body) return res
  if (!res.headers.get("content-type")?.includes("text/event-stream")) return res

  const reader = res.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const part = await new Promise<Awaited<ReturnType<typeof reader.read>>>((resolve, reject) => {
        const id = setTimeout(() => {
          const err = new Error("SSE read timed out")
          ctl.abort(err)
          void reader.cancel(err)
          reject(err)
        }, ms)

        reader.read().then(
          (part) => {
            clearTimeout(id)
            resolve(part)
          },
          (err) => {
            clearTimeout(id)
            reject(err)
          },
        )
      })

      if (part.done) {
        ctrl.close()
        return
      }

      ctrl.enqueue(part.value)
    },
    async cancel(reason) {
      ctl.abort(reason)
      await reader.cancel(reason)
    },
  })

  return new Response(body, {
    headers: new Headers(res.headers),
    status: res.status,
    statusText: res.statusText,
  })
}

type BundledSDK = {
  languageModel(modelId: string): LanguageModelV3
}

const BUNDLED_PROVIDERS: Record<string, () => Promise<(opts: any) => BundledSDK>> = {
  "@ai-sdk/amazon-bedrock": () => import("@ai-sdk/amazon-bedrock").then((m) => m.createAmazonBedrock),
  "@ai-sdk/anthropic": () => import("@ai-sdk/anthropic").then((m) => m.createAnthropic),
  "@ai-sdk/azure": () => import("@ai-sdk/azure").then((m) => m.createAzure),
  "@ai-sdk/google": () => import("@ai-sdk/google").then((m) => m.createGoogleGenerativeAI),
  "@ai-sdk/google-vertex": () => import("@ai-sdk/google-vertex").then((m) => m.createVertex),
  "@ai-sdk/google-vertex/anthropic": () =>
    import("@ai-sdk/google-vertex/anthropic").then((m) => m.createVertexAnthropic),
  "@ai-sdk/openai": () => import("@ai-sdk/openai").then((m) => m.createOpenAI),
  "@ai-sdk/openai-compatible": () => import("@ai-sdk/openai-compatible").then((m) => m.createOpenAICompatible),
  "@openrouter/ai-sdk-provider": () => import("@openrouter/ai-sdk-provider").then((m) => m.createOpenRouter),
  "@ai-sdk/xai": () => import("@ai-sdk/xai").then((m) => m.createXai),
  "@ai-sdk/mistral": () => import("@ai-sdk/mistral").then((m) => m.createMistral),
  "@ai-sdk/groq": () => import("@ai-sdk/groq").then((m) => m.createGroq),
  "@ai-sdk/deepinfra": () => import("@ai-sdk/deepinfra").then((m) => m.createDeepInfra),
  "@ai-sdk/cerebras": () => import("@ai-sdk/cerebras").then((m) => m.createCerebras),
  "@ai-sdk/cohere": () => import("@ai-sdk/cohere").then((m) => m.createCohere),
  "@ai-sdk/gateway": () => import("@ai-sdk/gateway").then((m) => m.createGateway),
  "@ai-sdk/togetherai": () => import("@ai-sdk/togetherai").then((m) => m.createTogetherAI),
  "@ai-sdk/perplexity": () => import("@ai-sdk/perplexity").then((m) => m.createPerplexity),
  "@ai-sdk/vercel": () => import("@ai-sdk/vercel").then((m) => m.createVercel),
  "@ai-sdk/alibaba": () => import("@ai-sdk/alibaba").then((m) => m.createAlibaba),
  "gitlab-ai-provider": () => import("gitlab-ai-provider").then((m) => m.createGitLab),
  "@ai-sdk/github-copilot": () => import("./sdk/copilot/copilot-provider").then((m) => m.createOpenaiCompatible),
  "venice-ai-sdk-provider": () => import("venice-ai-sdk-provider").then((m) => m.createVenice),
}

const ProviderApiInfo = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  npm: Schema.String,
})

const ProviderModalities = Schema.Struct({
  text: Schema.Boolean,
  audio: Schema.Boolean,
  image: Schema.Boolean,
  video: Schema.Boolean,
  pdf: Schema.Boolean,
})

const ProviderInterleaved = Schema.Union([
  Schema.Boolean,
  Schema.Struct({
    field: Schema.Literals(["reasoning_content", "reasoning_details"]),
  }),
])

const ProviderCapabilities = Schema.Struct({
  temperature: Schema.Boolean,
  reasoning: Schema.Boolean,
  attachment: Schema.Boolean,
  toolcall: Schema.Boolean,
  input: ProviderModalities,
  output: ProviderModalities,
  interleaved: ProviderInterleaved,
})

const ProviderCacheCost = Schema.Struct({
  read: Schema.Finite,
  write: Schema.Finite,
})

const ProviderCostTier = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cache: ProviderCacheCost,
  tier: Schema.Struct({
    type: Schema.Literal("context"),
    size: Schema.Finite,
  }),
})

const ProviderCost = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cache: ProviderCacheCost,
  tiers: optionalOmitUndefined(Schema.Array(ProviderCostTier)),
  experimentalOver200K: optionalOmitUndefined(
    Schema.Struct({
      input: Schema.Finite,
      output: Schema.Finite,
      cache: ProviderCacheCost,
    }),
  ),
})

const ProviderLimit = Schema.Struct({
  context: Schema.Finite,
  input: optionalOmitUndefined(Schema.Finite),
  output: Schema.Finite,
})

export const Model = Schema.Struct({
  id: ModelID,
  providerID: ProviderID,
  api: ProviderApiInfo,
  name: Schema.String,
  family: optionalOmitUndefined(Schema.String),
  capabilities: ProviderCapabilities,
  cost: ProviderCost,
  limit: ProviderLimit,
  status: ModelStatus,
  options: Schema.Record(Schema.String, Schema.Any),
  headers: Schema.Record(Schema.String, Schema.String),
  release_date: Schema.String,
  variants: optionalOmitUndefined(Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Any))),
}).annotate({ identifier: "Model" })
export type Model = Types.DeepMutable<Schema.Schema.Type<typeof Model>>

export const Info = Schema.Struct({
  id: ProviderID,
  name: Schema.String,
  source: Schema.Literals(["env", "config", "custom", "api"]),
  env: Schema.Array(Schema.String),
  key: optionalOmitUndefined(Schema.String),
  type: optionalOmitUndefined(Schema.String),
  description: optionalOmitUndefined(Schema.String),
  options: Schema.Record(Schema.String, Schema.Any),
  models: Schema.Record(Schema.String, Model),
}).annotate({ identifier: "Provider" })
export type Info = Types.DeepMutable<Schema.Schema.Type<typeof Info>>

const DefaultModelIDs = Schema.Record(Schema.String, Schema.String)

export const ListResult = Schema.Struct({
  all: Schema.Array(Info),
  default: DefaultModelIDs,
  connected: Schema.Array(Schema.String),
})
export type ListResult = Types.DeepMutable<Schema.Schema.Type<typeof ListResult>>

export const ConfigProvidersResult = Schema.Struct({
  providers: Schema.Array(Info),
  default: DefaultModelIDs,
})
export type ConfigProvidersResult = Types.DeepMutable<Schema.Schema.Type<typeof ConfigProvidersResult>>

export function toPublicInfo(provider: Info): Info {
  return JSON.parse(
    JSON.stringify(provider, (_, value) => {
      if (typeof value === "function" || typeof value === "symbol" || value === undefined) return undefined
      if (typeof value === "bigint") return value.toString()
      return value
    }),
  )
}

export function defaultModelIDs<T extends { models: Record<string, { id: string }> }>(providers: Record<string, T>) {
  return pickBy(
    mapValues(providers, (item) => sort(Object.values(item.models))[0]?.id),
    (v) => v !== undefined,
  )
}

export interface Interface {
  readonly list: () => Effect.Effect<Record<ProviderID, Info>>
  readonly getProvider: (providerID: ProviderID) => Effect.Effect<Info>
  readonly getModel: (providerID: ProviderID, modelID: ModelID) => Effect.Effect<Model>
  readonly getLanguage: (model: Model) => Effect.Effect<LanguageModelV3>
  readonly closest: (
    providerID: ProviderID,
    query: string[],
  ) => Effect.Effect<{ providerID: ProviderID; modelID: string } | undefined>
  readonly getSmallModel: (providerID: ProviderID) => Effect.Effect<Model | undefined>
  readonly defaultModel: () => Effect.Effect<{ providerID: ProviderID; modelID: ModelID }>
}

interface State {
  models: Map<string, LanguageModelV3>
  providers: Record<ProviderID, Info>
  sdk: Map<string, BundledSDK>
  modelLoaders: Record<string, (sdk: any, modelID: string, options?: Record<string, any>) => Promise<any>>
  varsLoaders: Record<string, (options: Record<string, any>) => Record<string, string>>
}

export class Service extends Context.Service<Service, Interface>()("@ravens/Provider") {}

const layer: Layer.Layer<
  Service,
  never,
  Config.Service | AppFileSystem.Service | Env.Service | ModelsDev.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* AppFileSystem.Service
    const config = yield* Config.Service
    const env = yield* Env.Service
    const modelsDevSvc = yield* ModelsDev.Service

    const state = yield* InstanceState.make<State>(() =>
      Effect.gen(function* () {
        using _ = log.time("state")
        const cfg = yield* config.get()
        const modelsDevData = yield* modelsDevSvc.get()

        const providers: Record<ProviderID, Info> = {} as Record<ProviderID, Info>
        const languages = new Map<string, LanguageModelV3>()
        const modelLoaders: Record<string, (sdk: any, modelID: string, options?: Record<string, any>) => Promise<any>> = {}
        const varsLoaders: Record<string, (options: Record<string, any>) => Record<string, string>> = {}
        const sdk = new Map<string, BundledSDK>()

        log.info("init")

        const configProviders = Object.entries(cfg.provider ?? {})
        const disabled = new Set(cfg.disabled_providers ?? [])
        const enabled = cfg.enabled_providers ? new Set(cfg.enabled_providers) : null

        function isProviderAllowed(providerID: ProviderID): boolean {
          if (enabled && !enabled.has(providerID)) return false
          if (disabled.has(providerID)) return false
          return true
        }

        for (const [providerID, provider] of configProviders) {
          const id = ProviderID.make(providerID)
          if (!isProviderAllowed(id)) continue

          const parsed: Info = {
            id,
            name: provider.name ?? providerID,
            env: provider.env ?? [],
            options: provider.options ?? {},
            source: "config",
            models: {},
          }

          const modelsDevEntry = modelsDevData[provider.type ?? ""] as ModelsDev.Provider | undefined
          for (const [modelID, model] of Object.entries(provider.models ?? {})) {
            const apiNpm = model.provider?.npm ?? provider.npm ?? modelsDevEntry?.npm ?? "@ai-sdk/openai-compatible"
            const apiID = model.id ?? modelID
            // Config-defined models rarely specify token limits; fall back to
            // models.dev metadata so overflow detection (auto-compaction)
            // still works for known models. A context of 0 disables it.
            const devModel = modelsDevEntry?.models?.[apiID] ?? modelsDevEntry?.models?.[modelID]
            const parsedModel: Model = {
              id: ModelID.make(modelID),
              api: {
                id: apiID,
                npm: apiNpm,
                url: model.provider?.api ?? provider.api ?? modelsDevEntry?.api ?? provider.options?.baseURL ?? "",
              },
              status: model.status ?? "active",
              name: model.name ?? modelID,
              providerID: id,
              capabilities: {
                temperature: model.temperature ?? false,
                reasoning: model.reasoning ?? false,
                attachment: model.attachment ?? false,
                toolcall: model.tool_call ?? true,
                input: {
                  text: model.modalities?.input?.includes("text") ?? true,
                  audio: model.modalities?.input?.includes("audio") ?? false,
                  image: model.modalities?.input?.includes("image") ?? false,
                  video: model.modalities?.input?.includes("video") ?? false,
                  pdf: model.modalities?.input?.includes("pdf") ?? false,
                },
                output: {
                  text: model.modalities?.output?.includes("text") ?? true,
                  audio: model.modalities?.output?.includes("audio") ?? false,
                  image: model.modalities?.output?.includes("image") ?? false,
                  video: model.modalities?.output?.includes("video") ?? false,
                  pdf: model.modalities?.output?.includes("pdf") ?? false,
                },
                interleaved:
                  model.interleaved ??
                  (apiNpm === "@ai-sdk/openai-compatible" && apiID.includes("deepseek")
                    ? { field: "reasoning_content" }
                    : false),
              },
              cost: {
                input: model?.cost?.input ?? 0,
                output: model?.cost?.output ?? 0,
                cache: {
                  read: model?.cost?.cache_read ?? 0,
                  write: model?.cost?.cache_write ?? 0,
                },
              },
              options: model.options ?? {},
              limit: {
                context: model.limit?.context ?? devModel?.limit?.context ?? 0,
                input: model.limit?.input ?? devModel?.limit?.input,
                output: model.limit?.output ?? devModel?.limit?.output ?? 0,
              },
              headers: model.headers ?? {},
              family: model.family ?? "",
              release_date: model.release_date ?? "",
              variants: {},
            }
            const merged = mergeDeep(ProviderTransform.variants(parsedModel), model.variants ?? {})
            parsedModel.variants = mapValues(
              pickBy(merged, (v) => !v.disabled),
              (v) => omit(v, ["disabled"]),
            )
            parsed.models[modelID] = parsedModel
          }
          providers[id] = parsed
        }

        for (const [id, provider] of Object.entries(providers)) {
          const providerID = ProviderID.make(id)
          const configProvider = cfg.provider?.[providerID]

          for (const [modelID, model] of Object.entries(provider.models)) {
            model.api.id = model.api.id ?? model.id ?? modelID
            if (model.status === "alpha" && !Flag.RAVENS_ENABLE_EXPERIMENTAL_MODELS) delete provider.models[modelID]
            if (model.status === "deprecated") delete provider.models[modelID]
            if (
              (configProvider?.blacklist && configProvider.blacklist.includes(modelID)) ||
              (configProvider?.whitelist && !configProvider.whitelist.includes(modelID))
            )
              delete provider.models[modelID]

            if (!model.variants || Object.keys(model.variants).length === 0) {
              model.variants = mapValues(ProviderTransform.variants(model), (v) => v)
            }

            const configVariants = configProvider?.models?.[modelID]?.variants
            if (configVariants && model.variants) {
              const merged = mergeDeep(model.variants, configVariants)
              model.variants = mapValues(
                pickBy(merged, (v) => !v.disabled),
                (v) => omit(v, ["disabled"]),
              )
            }
          }

          if (Object.keys(provider.models).length === 0) {
            delete providers[providerID]
            continue
          }

          log.info("found", { providerID })
        }

        return {
          models: languages,
          providers,
          sdk,
          modelLoaders,
          varsLoaders,
        }
      }),
    )

    const list = Effect.fn("Provider.list")(() => InstanceState.use(state, (s) => s.providers))

    async function resolveSDK(model: Model, s: State, envs: Record<string, string | undefined>) {
      try {
        using _ = log.time("getSDK", {
          providerID: model.providerID,
        })
        const provider = s.providers[model.providerID]
        const options = { ...provider.options }

        if (model.providerID === "google-vertex" && !model.api.npm.includes("@ai-sdk/openai-compatible")) {
          delete options.fetch
        }

        if (model.api.npm.includes("@ai-sdk/openai-compatible") && options["includeUsage"] !== false) {
          options["includeUsage"] = true
        }

        const baseURL = iife(() => {
          let url =
            model.api.url || (typeof options["baseURL"] === "string" && options["baseURL"] !== "" ? options["baseURL"] : "")
          if (!url) return

          const loader = s.varsLoaders[model.providerID]
          if (loader) {
            const vars = loader(options)
            for (const [key, value] of Object.entries(vars)) {
              const field = "${" + key + "}"
              url = url.replaceAll(field, value)
            }
          }

          url = url.replace(/\$\{([^}]+)\}/g, (item, key) => {
            const val = envs[String(key)]
            return val ?? item
          })
          return url
        })

        if (baseURL !== undefined) options["baseURL"] = baseURL
        if (options["apiKey"] === undefined && provider.key) options["apiKey"] = provider.key
        if (model.headers)
          options["headers"] = {
            ...options["headers"],
            ...model.headers,
          }

        if (model.api.npm === "@ai-sdk/anthropic") {
          options["headers"] = {
            "anthropic-beta": "interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
            ...options["headers"],
          }
        }

        const key = Hash.fast(
          JSON.stringify({
            providerID: model.providerID,
            npm: model.api.npm,
            options,
          }),
        )
        const existing = s.sdk.get(key)
        if (existing) return existing

        const customFetch = options["fetch"]
        const chunkTimeout = options["chunkTimeout"]
        delete options["chunkTimeout"]

        options["fetch"] = async (input: any, init?: BunFetchRequestInit) => {
          const fetchFn = customFetch ?? fetch
          const opts = init ?? {}
          const chunkAbortCtl = typeof chunkTimeout === "number" && chunkTimeout > 0 ? new AbortController() : undefined
          const signals: AbortSignal[] = []

          if (opts.signal) signals.push(opts.signal)
          if (chunkAbortCtl) signals.push(chunkAbortCtl.signal)
          if (options["timeout"] !== undefined && options["timeout"] !== null && options["timeout"] !== false)
            signals.push(AbortSignal.timeout(options["timeout"]))

          const combined = signals.length === 0 ? null : signals.length === 1 ? signals[0] : AbortSignal.any(signals)
          if (combined) opts.signal = combined

          // Strip openai itemId metadata following what codex does
          if (
            (model.api.npm === "@ai-sdk/openai" || model.api.npm === "@ai-sdk/azure") &&
            opts.body &&
            opts.method === "POST"
          ) {
            const body = JSON.parse(opts.body as string)
            const keepIds = body.store === true
            if (!keepIds && Array.isArray(body.input)) {
              for (const item of body.input) {
                if ("id" in item) {
                  delete item.id
                }
              }
              opts.body = JSON.stringify(body)
            }
          }

          const res = await fetchFn(input, {
            ...opts,
            // @ts-ignore see here: https://github.com/oven-sh/bun/issues/16682
            timeout: false,
          })

          if (!chunkAbortCtl) return res
          return wrapSSE(res, chunkTimeout, chunkAbortCtl)
        }

        const bundledLoader = BUNDLED_PROVIDERS[model.api.npm]
        if (bundledLoader) {
          log.info("using bundled provider", {
            providerID: model.providerID,
            pkg: model.api.npm,
          })
          const factory = await bundledLoader()
          const loaded = factory({
            name: model.providerID,
            ...options,
          })
          s.sdk.set(key, loaded)
          return loaded as SDK
        }

        let installedPath: string
        if (!model.api.npm.startsWith("file://")) {
          const item = await Npm.add(model.api.npm)
          if (!item.entrypoint) throw new Error(`Package ${model.api.npm} has no import entrypoint`)
          installedPath = item.entrypoint
        } else {
          log.info("loading local provider", { pkg: model.api.npm })
          installedPath = model.api.npm
        }

        // `installedPath` is a local entry path or an existing `file://` URL. Normalize
        // only path inputs so Node on Windows accepts the dynamic import.
        const importSpec = installedPath.startsWith("file://") ? installedPath : pathToFileURL(installedPath).href
        const mod = await import(importSpec)

        const fn = mod[Object.keys(mod).find((key) => key.startsWith("create"))!]
        const loaded = fn({
          name: model.providerID,
          ...options,
        })
        s.sdk.set(key, loaded)
        return loaded as SDK
      } catch (e) {
        throw new InitError({ providerID: model.providerID }, { cause: e })
      }
    }

    const getProvider = Effect.fn("Provider.getProvider")((providerID: ProviderID) =>
      InstanceState.use(state, (s) => s.providers[providerID]),
    )

    const getModel = Effect.fn("Provider.getModel")(function* (providerID: ProviderID, modelID: ModelID) {
      const s = yield* InstanceState.get(state)
      const provider = s.providers[providerID]
      if (!provider) {
        const available = Object.keys(s.providers)
        const matches = fuzzysort.go(providerID, available, { limit: 3, threshold: -10000 })
        throw new ModelNotFoundError({ providerID, modelID, suggestions: matches.map((m) => m.target) })
      }

      const info = provider.models[modelID]
      if (!info) {
        const available = Object.keys(provider.models)
        const matches = fuzzysort.go(modelID, available, { limit: 3, threshold: -10000 })
        throw new ModelNotFoundError({ providerID, modelID, suggestions: matches.map((m) => m.target) })
      }
      return info
    })

    const getLanguage = Effect.fn("Provider.getLanguage")(function* (model: Model) {
      const s = yield* InstanceState.get(state)
      const envs = yield* env.all()
      const key = `${model.providerID}/${model.id}`
      if (s.models.has(key)) return s.models.get(key)!

      return yield* Effect.promise(async () => {
        const provider = s.providers[model.providerID]
        const sdk = await resolveSDK(model, s, envs)

        try {
          const language = s.modelLoaders[model.providerID]
            ? await s.modelLoaders[model.providerID](sdk, model.api.id, {
                ...provider.options,
                ...model.options,
              })
            : sdk.languageModel(model.api.id)
          s.models.set(key, language)
          return language
        } catch (e) {
          if (e instanceof NoSuchModelError)
            throw new ModelNotFoundError(
              {
                modelID: model.id,
                providerID: model.providerID,
              },
              { cause: e },
            )
          throw e
        }
      })
    })

    const closest = Effect.fn("Provider.closest")(function* (providerID: ProviderID, query: string[]) {
      const s = yield* InstanceState.get(state)
      const provider = s.providers[providerID]
      if (!provider) return undefined
      for (const item of query) {
        for (const modelID of Object.keys(provider.models)) {
          if (modelID.includes(item)) return { providerID, modelID }
        }
      }
      return undefined
    })

    const getSmallModel = Effect.fn("Provider.getSmallModel")(function* (providerID: ProviderID) {
      const cfg = yield* config.get()

      if (cfg.small_model) {
        const parsed = parseModel(cfg.small_model)
        return yield* getModel(parsed.providerID, parsed.modelID)
      }

      const s = yield* InstanceState.get(state)
      const provider = s.providers[providerID]
      if (!provider) return undefined

      let priority = [
        "claude-haiku-4-5",
        "claude-haiku-4.5",
        "3-5-haiku",
        "3.5-haiku",
        "gemini-3-flash",
        "gemini-2.5-flash",
        "gpt-5-nano",
      ]
      if (providerID.startsWith("ravens")) {
        priority = ["gpt-5-nano"]
      }
      if (providerID.startsWith("github-copilot")) {
        priority = ["gpt-5-mini", "claude-haiku-4.5", ...priority]
      }
      for (const item of priority) {
        if (providerID === ProviderID.amazonBedrock) {
          const crossRegionPrefixes = ["global.", "us.", "eu."]
          const candidates = Object.keys(provider.models).filter((m) => m.includes(item))

          const globalMatch = candidates.find((m) => m.startsWith("global."))
          if (globalMatch) return yield* getModel(providerID, ModelID.make(globalMatch))

          const region = provider.options?.region
          if (region) {
            const regionPrefix = region.split("-")[0]
            if (regionPrefix === "us" || regionPrefix === "eu") {
              const regionalMatch = candidates.find((m) => m.startsWith(`${regionPrefix}.`))
              if (regionalMatch) return yield* getModel(providerID, ModelID.make(regionalMatch))
            }
          }

          const unprefixed = candidates.find((m) => !crossRegionPrefixes.some((p) => m.startsWith(p)))
          if (unprefixed) return yield* getModel(providerID, ModelID.make(unprefixed))
        } else {
          for (const model of Object.keys(provider.models)) {
            if (model.includes(item)) return yield* getModel(providerID, ModelID.make(model))
          }
        }
      }

      return undefined
    })

    const defaultModel = Effect.fn("Provider.defaultModel")(function* () {
      const cfg = yield* config.get()
      if (cfg.model) return parseModel(cfg.model)

      const s = yield* InstanceState.get(state)
      const recent = yield* fs.readJson(path.join(Global.Path.state, "model.json")).pipe(
        Effect.map((x): { providerID: ProviderID; modelID: ModelID }[] => {
          if (!isRecord(x) || !Array.isArray(x.recent)) return []
          return x.recent.flatMap((item) => {
            if (!isRecord(item)) return []
            if (typeof item.providerID !== "string") return []
            if (typeof item.modelID !== "string") return []
            return [{ providerID: ProviderID.make(item.providerID), modelID: ModelID.make(item.modelID) }]
          })
        }),
        Effect.catch(() => Effect.succeed([] as { providerID: ProviderID; modelID: ModelID }[])),
      )
      for (const entry of recent) {
        const provider = s.providers[entry.providerID]
        if (!provider) continue
        if (!provider.models[entry.modelID]) continue
        return { providerID: entry.providerID, modelID: entry.modelID }
      }

      const provider = Object.values(s.providers).find((p) => !cfg.provider || Object.keys(cfg.provider).includes(p.id))
      if (!provider) throw new Error("no providers found")
      const [model] = sort(Object.values(provider.models))
      if (!model) throw new Error("no models found")
      return {
        providerID: provider.id,
        modelID: model.id,
      }
    })

    return Service.of({ list, getProvider, getModel, getLanguage, closest, getSmallModel, defaultModel })
  }),
)

export const defaultLayer = Layer.suspend(() =>
  layer.pipe(
    Layer.provide(AppFileSystem.defaultLayer),
    Layer.provide(Env.defaultLayer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(ModelsDev.defaultLayer),
  ),
)

const priority = ["gpt-5", "claude-sonnet-4", "big-pickle", "gemini-3-pro"]
export function sort<T extends { id: string }>(models: T[]) {
  return sortBy(
    models,
    [(model) => priority.findIndex((filter) => model.id.includes(filter)), "desc"],
    [(model) => (model.id.includes("latest") ? 0 : 1), "asc"],
    [(model) => model.id, "desc"],
  )
}

export function parseModel(model: string) {
  const [providerID, ...rest] = model.split("/")
  return {
    providerID: ProviderID.make(providerID),
    modelID: ModelID.make(rest.join("/")),
  }
}

export const ModelNotFoundError = NamedError.create("ProviderModelNotFoundError", {
  providerID: ProviderID,
  modelID: ModelID,
  suggestions: Schema.optional(Schema.Array(Schema.String)),
})

export const InitError = NamedError.create("ProviderInitError", {
  providerID: ProviderID,
})

export * as Provider from "./provider"
