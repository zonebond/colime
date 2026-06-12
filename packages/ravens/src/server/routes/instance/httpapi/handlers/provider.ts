import { ProviderAuth } from "@/provider/auth"
import { Config } from "@/config/config"
import { ConfigProvider } from "@/config/provider"
import { Provider } from "@/provider/provider"
import { ProviderID } from "@/provider/schema"
import { ModelsDev } from "@/provider/models"
import { Effect, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { InstanceState } from "@/effect/instance-state"
import { AppFileSystem } from "@ravens-ai/core/filesystem"
import { Flag } from "@ravens-ai/core/flag/flag"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { EffectBridge } from "@/effect/bridge"
import path from "path"

const ModelInput = Schema.Union([
  Schema.String,
  Schema.Struct({ id: Schema.String, name: Schema.optional(Schema.String) }),
])

const CreateProviderInput = Schema.Struct({
  type: Schema.String,
  name: Schema.optional(Schema.String),
  baseUrl: Schema.optional(Schema.String),
  apiKey: Schema.optional(Schema.String),
  models: Schema.optional(Schema.Array(ModelInput)),
  description: Schema.optional(Schema.String),
}).annotate({ identifier: "CreateProviderInput" })

const UpdateProviderInput = Schema.Struct({
  type: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  baseUrl: Schema.optional(Schema.String),
  apiKey: Schema.optional(Schema.String),
  models: Schema.optional(Schema.Array(ModelInput)),
  description: Schema.optional(Schema.String),
}).annotate({ identifier: "UpdateProviderInput" })

function normalizeModel(m: string | { id: string; name?: string }): { id: string; name?: string } {
  return typeof m === "string" ? { id: m } : m
}

function randomHex(len: number): string {
  const chars = "0123456789abcdef"
  let result = ""
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * 16)]
  }
  return result
}

function generateInstanceID(type: string): string {
  return type.toLowerCase().replace(/\s+/g, "-") + "-" + randomHex(8)
}

function toConfigProvider(input: typeof CreateProviderInput.Type): typeof ConfigProvider.Info.Type {
  const models: Record<string, any> = {}
  for (const raw of input.models ?? []) {
    const m = normalizeModel(raw)
    const entry: Record<string, any> = {}
    if (m.name !== undefined) entry.name = m.name
    models[m.id] = entry
  }
  return {
    type: input.type,
    name: input.name ?? input.type,
    options: {
      baseURL: input.baseUrl ?? "",
      ...(input.apiKey ? { apiKey: input.apiKey } : {}),
    },
    ...(input.description ? { description: input.description } : {}),
    models,
  }
}

const builtinDefaults = {
  api: { id: "", url: "", npm: "@ai-sdk/openai-compatible" },
  family: "",
  status: "active" as const,
  capabilities: {
    temperature: false,
    reasoning: false,
    attachment: false,
    toolcall: true,
    input: { text: true, audio: false, image: false, video: false, pdf: false },
    output: { text: true, audio: false, image: false, video: false, pdf: false },
    interleaved: false,
  },
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  limit: { context: 0, output: 0 },
  options: {},
  headers: {},
  release_date: "",
  variants: {},
}

function buildProviderInfo(instanceID: string, entry: Record<string, any>, modelsDev: Record<string, any>): Record<string, any> {
  const providerType = (entry as any).type ?? ""
  const baseURL = entry.options?.baseURL ?? ""
  const modelsDevEntry = modelsDev[providerType] as ModelsDev.Provider | undefined
  const npm = modelsDevEntry?.npm ?? "@ai-sdk/openai-compatible"
  const apiURL = modelsDevEntry?.api || baseURL || ""
  const models: Record<string, any> = {}
  for (const [mid, m] of Object.entries((entry as any).models ?? {})) {
    models[mid] = {
      ...builtinDefaults,
      id: mid,
      name: (m as any).name ?? mid,
      providerID: instanceID,
      api: {
        ...builtinDefaults.api,
        id: mid,
        url: apiURL,
        npm,
      },
    }
  }
  return {
    id: instanceID,
    name: (entry as any).name ?? instanceID,
    source: "config" as const,
    env: entry.options?.apiKey ? ["API_KEY"] : [],
    type: providerType,
    description: (entry as any).description,
    options: (entry as any).options ?? {},
    models,
  }
}

export const providerHandlers = HttpApiBuilder.group(InstanceHttpApi, "provider", (handlers) =>
  Effect.gen(function* () {
    const cfg = yield* Config.Service
    const provider = yield* Provider.Service
    const svc = yield* ProviderAuth.Service
    const modelsDevSvc = yield* ModelsDev.Service
    const bridge = yield* EffectBridge.make()
    const modelsDevData = yield* modelsDevSvc.get()

    const getConfigPath = () => {
      const dir = Flag.RAVENS_CONFIG_DIR
      if (dir) return path.join(dir, "config.json")
      return undefined as string | undefined
    }

    const getMergedProvider = () =>
      Effect.gen(function* () {
        const config = yield* cfg.get()
        const fs = yield* AppFileSystem.Service
        // Prefer RAVENS_CONFIG_DIR for config persistence; fall back to instance directory
        const file = getConfigPath() ?? path.join(yield* InstanceState.directory, "config.json")
        const instanceConfig = yield* Effect.orElseSucceed(
          Effect.gen(function* () {
            const text = yield* fs.readFileString(file)
            return JSON.parse(text) as Record<string, any>
          }),
          () => ({}),
        )
        return {
          config,
          configFile: file,
          provider: { ...(config.provider ?? {}), ...(instanceConfig.provider ?? {}) } as Record<string, any>,
        }
      })

    const list = Effect.fn("ProviderHttpApi.list")(function* () {
      const { config, provider: mergedProvider } = yield* getMergedProvider()
      const disabled = new Set(config.disabled_providers ?? [])
      const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined
      const connected = yield* provider.list()

      const isAllowed = (key: string) => (!enabled || enabled.has(key)) && !disabled.has(key)

      const providers: Record<string, any> = {}
      for (const [key, entry] of Object.entries(mergedProvider)) {
        if (!isAllowed(key)) continue
        providers[key] = buildProviderInfo(key, entry as Record<string, any>, modelsDevData)
      }
      // Include connected providers that aren't in config (e.g. env/auth connected)
      for (const [key, connectedProvider] of Object.entries(connected)) {
        if (!providers[key]) providers[key] = connectedProvider
      }

      return {
        all: Object.values(providers).map(Provider.toPublicInfo),
        default: Provider.defaultModelIDs(providers),
        connected: Object.keys(providers).filter((k) => providers[k].env?.length > 0 || providers[k].options?.apiKey),
      }
    })

    const create = Effect.fn("ProviderHttpApi.create")(function* (ctx: {
      payload: typeof CreateProviderInput.Type
    }) {
      const { config, configFile, provider: existing } = yield* getMergedProvider()
      const providerID = generateInstanceID(ctx.payload.type)
      const entry = toConfigProvider(ctx.payload)
      const updated = { ...config, provider: { ...existing, [providerID]: entry } }
      yield* cfg.update(updated)
      const fs = yield* AppFileSystem.Service
      const raw = yield* Effect.orElseSucceed(
        Effect.gen(function* () {
          const text = yield* fs.readFileString(configFile)
          return JSON.parse(text) as Record<string, any>
        }),
        () => ({}),
      )
      raw.provider = { ...(raw.provider ?? {}), [providerID]: entry }
      yield* fs.writeFileString(configFile, JSON.stringify(raw, null, 2)).pipe(Effect.orDie)
      bridge.fork(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))
      return { id: providerID, ...entry }
    })

    const update = Effect.fn("ProviderHttpApi.update")(function* (ctx: {
      params: { providerID: ProviderID }
      payload: typeof UpdateProviderInput.Type
    }) {
      const { config, configFile, provider: existing } = yield* getMergedProvider()
      const id = ctx.params.providerID
      if (!existing[id]) {
        return yield* Effect.fail(new HttpApiError.NotFound({}))
      }
      const current = existing[id]
      const input = ctx.payload
      const merged: Record<string, any> = { ...current }
      if (input.name !== undefined) merged.name = input.name
      if (input.description !== undefined) merged.description = input.description
      if (input.baseUrl !== undefined) {
        merged.options = { ...(merged.options ?? {}), baseURL: input.baseUrl }
      }
      if (input.apiKey !== undefined) {
        merged.options = { ...(merged.options ?? {}), apiKey: input.apiKey }
      }
      if (input.models !== undefined) {
        const models: Record<string, any> = {}
        for (const raw of input.models) {
          const m = normalizeModel(raw)
          const entry: Record<string, any> = {}
          if (m.name !== undefined) entry.name = m.name
          models[m.id] = entry
        }
        merged.models = models
      }
      const updated = { ...config, provider: { ...existing, [id]: merged } }
      yield* cfg.update(updated)
      const fs = yield* AppFileSystem.Service
      const raw = yield* Effect.orElseSucceed(
        Effect.gen(function* () {
          const text = yield* fs.readFileString(configFile)
          return JSON.parse(text) as Record<string, any>
        }),
        () => ({}),
      )
      raw.provider = { ...(raw.provider ?? {}), [id]: merged }
      yield* fs.writeFileString(configFile, JSON.stringify(raw, null, 2)).pipe(Effect.orDie)
      bridge.fork(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))
      return { id, ...merged }
    })

    const del = Effect.fn("ProviderHttpApi.delete")(function* (ctx: {
      params: { providerID: ProviderID }
    }) {
      const { configFile, provider: existing } = yield* getMergedProvider()
      const id = ctx.params.providerID
      if (!existing[id]) {
        return yield* Effect.fail(new HttpApiError.NotFound({}))
      }
      const fs = yield* AppFileSystem.Service
      const raw = yield* Effect.orElseSucceed(
        Effect.gen(function* () {
          const text = yield* fs.readFileString(configFile)
          return JSON.parse(text) as Record<string, any>
        }),
        () => ({}),
      )
      const provider = { ...(raw.provider ?? {}) }
      delete provider[id]
      raw.provider = provider
      yield* fs.writeFileString(configFile, JSON.stringify(raw, null, 2)).pipe(Effect.orDie)
      bridge.fork(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))
      return { success: true }
    })

    const auth = Effect.fn("ProviderHttpApi.auth")(function* () {
      return yield* svc.methods()
    })

    const authorize = Effect.fn("ProviderHttpApi.authorize")(function* (ctx: {
      params: { providerID: ProviderID }
      payload: ProviderAuth.AuthorizeInput
    }) {
      return yield* svc
        .authorize({
          providerID: ctx.params.providerID,
          method: ctx.payload.method,
          inputs: ctx.payload.inputs,
        })
        .pipe(Effect.catch(() => Effect.fail(new HttpApiError.BadRequest({}))))
    })

    const authorizeRaw = Effect.fn("ProviderHttpApi.authorizeRaw")(function* (ctx: {
      params: { providerID: ProviderID }
      request: HttpServerRequest.HttpServerRequest
    }) {
      const body = yield* Effect.orDie(ctx.request.text)
      const payload = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ProviderAuth.AuthorizeInput))(body).pipe(
        Effect.mapError(() => new HttpApiError.BadRequest({})),
      )
      const result = yield* authorize({ params: ctx.params, payload })
      return HttpServerResponse.jsonUnsafe(result ?? null)
    })

    const callback = Effect.fn("ProviderHttpApi.callback")(function* (ctx: {
      params: { providerID: ProviderID }
      payload: ProviderAuth.CallbackInput
    }) {
      yield* svc
        .callback({
          providerID: ctx.params.providerID,
          method: ctx.payload.method,
          code: ctx.payload.code,
        })
        .pipe(Effect.catch(() => Effect.fail(new HttpApiError.BadRequest({}))))
      return true
    })

    const test = Effect.fn("ProviderHttpApi.test")(function* (ctx: {
      params: { providerID: ProviderID }
    }) {
      const { provider: existing } = yield* getMergedProvider()
      const id = ctx.params.providerID
      const entry = existing[id]
      if (!entry) {
        return yield* Effect.fail(new HttpApiError.NotFound({}))
      }
      const providerType = (entry as any).type ?? ""
      const baseURL = entry.options?.baseURL || modelsDevData[providerType]?.api || ""
      const apiKey = entry.options?.apiKey || ""
      if (!baseURL) {
        return { success: false, error: "No base URL configured" }
      }

      const headers: Record<string, string> = {}
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`
      }

      const tryFetch = (url: string) =>
        Effect.tryPromise({
          try: () => fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(10000) }),
          catch: (err) => err as Error,
        })

      // Try /models — OpenAI-compatible APIs require valid auth and return 401 on bad keys
      const modelsURL = baseURL.replace(/\/+$/, "") + "/models"
      const result = yield* tryFetch(modelsURL)

      if (result instanceof Error) {
        return { success: false, error: result.message }
      }
      if (result.ok) {
        return { success: true }
      }
      if (result.status === 401 || result.status === 403) {
        return { success: false, error: "Authentication failed — check API Key" }
      }
      // Non-OpenAI endpoints (Anthropic, etc.) don't support GET /models.
      // Any HTTP response proves the server is reachable.
      return { success: true }
    })

    return handlers
      .handle("list", list)
      .handle("create", create)
      .handle("update", update)
      .handle("delete", del)
      .handle("test", test)
      .handle("auth", auth)
      .handleRaw("authorize", authorizeRaw)
      .handle("callback", callback)
  }),
)
