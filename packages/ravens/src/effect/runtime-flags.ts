import { Config, ConfigProvider, Context, Effect, Layer } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const experimental = bool("RAVENS_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: bool(name) }).pipe(Config.map((flags) => flags.experimental || flags.enabled))

export class Service extends ConfigService.Service<Service>()("@ravens/RuntimeFlags", {
  pure: bool("RAVENS_PURE"),
  disableDefaultPlugins: bool("RAVENS_DISABLE_DEFAULT_PLUGINS"),
  enableExa: Config.all({
    experimental,
    enabled: bool("RAVENS_ENABLE_EXA"),
    legacy: bool("RAVENS_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("RAVENS_ENABLE_PARALLEL"),
    legacy: bool("RAVENS_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableQuestionTool: bool("RAVENS_ENABLE_QUESTION_TOOL"),
  experimentalScout: enabledByExperimental("RAVENS_EXPERIMENTAL_SCOUT"),
  experimentalLspTool: enabledByExperimental("RAVENS_EXPERIMENTAL_LSP_TOOL"),
  experimentalPlanMode: enabledByExperimental("RAVENS_EXPERIMENTAL_PLAN_MODE"),
  client: Config.string("RAVENS_CLIENT").pipe(Config.withDefault("cli")),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.defaultLayer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const defaultLayer = Service.defaultLayer.pipe(Layer.orDie)

export * as RuntimeFlags from "./runtime-flags"
