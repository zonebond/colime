import { rm, mkdir } from "fs/promises"
import path from "path"
import { pathToFileURL } from "url"
import { Effect, Layer, Context, Schema } from "effect"
import { NamedError } from "@ravens-ai/core/util/error"
import type { Agent } from "@/agent/agent"
import { Bus } from "@/bus"
import { InstanceState } from "@/effect/instance-state"
import { Flag } from "@ravens-ai/core/flag/flag"
import { Global } from "@ravens-ai/core/global"
import { Permission } from "@/permission"
import { AppFileSystem } from "@ravens-ai/core/filesystem"
import { Config } from "@/config/config"
import { ConfigMarkdown } from "@/config/markdown"
import { Glob } from "@ravens-ai/core/util/glob"
import * as Log from "@ravens-ai/core/util/log"
import { Discovery } from "./discovery"
import CUSTOMIZE_RAVENS_SKILL_BODY from "./prompt/customize-ravens.md" with { type: "text" }
import { isRecord } from "@/util/record"

const log = Log.create({ service: "skill" })
const CLAUDE_EXTERNAL_DIR = ".claude"
const AGENTS_EXTERNAL_DIR = ".agents"
const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"
const RAVENS_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"
const SKILL_PATTERN = "**/SKILL.md"

// Built-in skill that ships with ravens. The model's intuition for what an
// ravens.json should look like is often wrong, and ravens hard-fails on
// invalid config, so users hit cryptic startup errors. Loading this skill
// when the model is asked to touch ravens's own config files gives it the
// actual schemas instead of guesses.
const CUSTOMIZE_RAVENS_SKILL_NAME = "customize-ravens"
const CUSTOMIZE_RAVENS_SKILL_DESCRIPTION =
  "Use ONLY when the user is editing or creating ravens's own configuration: ravens.json, ravens.jsonc, files under .ravens/, or files under ~/.config/ravens/. Also use when creating or fixing ravens agents, subagents, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring ravens itself."

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  location: Schema.String,
  content: Schema.String,
  mtime: Schema.optional(Schema.Number),
})
export type Info = Schema.Schema.Type<typeof Info>

const Issue = Schema.StructWithRest(
  Schema.Struct({
    message: Schema.String,
    path: Schema.Array(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)

function isSkillFrontmatter(data: unknown): data is { name: string; description?: string } {
  return (
    isRecord(data) &&
    typeof data.name === "string" &&
    (data.description === undefined || typeof data.description === "string")
  )
}

export const InvalidError = NamedError.create("SkillInvalidError", {
  path: Schema.String,
  message: Schema.optional(Schema.String),
  issues: Schema.optional(Schema.Array(Issue)),
})

export const NameMismatchError = NamedError.create("SkillNameMismatchError", {
  path: Schema.String,
  expected: Schema.String,
  actual: Schema.String,
})

type State = {
  skills: Record<string, Info>
  dirs: Set<string>
}

type DiscoveryState = {
  matches: string[]
  dirs: string[]
}

type ScanState = {
  matches: Set<string>
  dirs: Set<string>
}

export const RemoveError = NamedError.create("SkillRemoveError", {
  name: Schema.String,
  reason: Schema.String,
})

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly all: () => Effect.Effect<Info[]>
  readonly dirs: () => Effect.Effect<string[]>
  readonly available: (agent?: Agent.Info) => Effect.Effect<Info[]>
  readonly reload: () => Effect.Effect<boolean>
  readonly remove: (name: string) => Effect.Effect<boolean>
  readonly create: (input: { name: string; description?: string; content: string }) => Effect.Effect<Info>
  readonly update: (name: string, input: { description?: string; content?: string }) => Effect.Effect<Info>
}

const add = Effect.fnUntraced(function* (state: State, match: string, bus: Bus.Interface) {
  const md = yield* Effect.tryPromise({
    try: () => ConfigMarkdown.parse(match),
    catch: (err) => err,
  }).pipe(
    Effect.catch(
      Effect.fnUntraced(function* (err) {
        const message = ConfigMarkdown.FrontmatterError.isInstance(err)
          ? err.data.message
          : `Failed to parse skill ${match}`
        const { Session } = yield* Effect.promise(() => import("@/session/session"))
        yield* bus.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() })
        log.error("failed to load skill", { skill: match, err })
        return undefined
      }),
    ),
  )

  if (!md) return

  if (!isSkillFrontmatter(md.data)) return

  if (state.skills[md.data.name]) {
    log.warn("duplicate skill name", {
      name: md.data.name,
      existing: state.skills[md.data.name].location,
      duplicate: match,
    })
  }

  let mtime: number | undefined
  try {
    mtime = Bun.file(match).lastModified
  } catch {
    // ignore — file may not be stat-able
  }

  state.dirs.add(path.dirname(match))
  state.skills[md.data.name] = {
    name: md.data.name,
    description: md.data.description,
    location: match,
    content: md.content,
    mtime,
  }
})

const scan = Effect.fnUntraced(function* (
  state: ScanState,
  root: string,
  pattern: string,
  opts?: { dot?: boolean; scope?: string },
) {
  const matches = yield* Effect.tryPromise({
    try: () =>
      Glob.scan(pattern, {
        cwd: root,
        absolute: true,
        include: "file",
        symlink: true,
        dot: opts?.dot,
      }),
    catch: (error) => error,
  }).pipe(
    Effect.catch((error) => {
      if (!opts?.scope) return Effect.die(error)
      log.error(`failed to scan ${opts.scope} skills`, { dir: root, error })
      return Effect.succeed([] as string[])
    }),
  )

  for (const match of matches) {
    state.matches.add(match)
    state.dirs.add(path.dirname(match))
  }
})

const discoverSkills = Effect.fnUntraced(function* (
  config: Config.Interface,
  discovery: Discovery.Interface,
  fsys: AppFileSystem.Interface,
  global: Global.Interface,
  directory: string,
  worktree: string,
) {
  const state: ScanState = { matches: new Set(), dirs: new Set() }

  const externalDirs: string[] = []
  if (!Flag.RAVENS_DISABLE_EXTERNAL_SKILLS) {
    if (!Flag.RAVENS_DISABLE_CLAUDE_CODE_SKILLS) externalDirs.push(CLAUDE_EXTERNAL_DIR)
    externalDirs.push(AGENTS_EXTERNAL_DIR)

    for (const dir of externalDirs) {
      const root = path.join(global.home, dir)
      if (!(yield* fsys.isDir(root))) continue
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "global" })
    }

    const upDirs = yield* fsys
      .up({ targets: externalDirs, start: directory, stop: worktree })
      .pipe(Effect.catch(() => Effect.succeed([] as string[])))

    for (const root of upDirs) {
      yield* scan(state, root, EXTERNAL_SKILL_PATTERN, { dot: true, scope: "project" })
    }
  }

  const configDirs = yield* config.directories()
  for (const dir of configDirs) {
    yield* scan(state, dir, RAVENS_SKILL_PATTERN)
  }

  const cfg = yield* config.get()
  for (const item of cfg.skills?.paths ?? []) {
    const expanded = item.startsWith("~/") ? path.join(global.home, item.slice(2)) : item
    const dir = path.isAbsolute(expanded) ? expanded : path.join(directory, expanded)
    if (!(yield* fsys.isDir(dir))) {
      log.warn("skill path not found", { path: dir })
      continue
    }

    yield* scan(state, dir, SKILL_PATTERN)
  }

  for (const url of cfg.skills?.urls ?? []) {
    const pulledDirs = yield* discovery.pull(url)
    for (const dir of pulledDirs) {
      yield* scan(state, dir, SKILL_PATTERN)
    }
  }

  return {
    matches: Array.from(state.matches),
    dirs: Array.from(state.dirs),
  }
})

const loadSkills = Effect.fnUntraced(function* (state: State, discovered: DiscoveryState, bus: Bus.Interface) {
  yield* Effect.forEach(discovered.matches, (match) => add(state, match, bus), {
    concurrency: "unbounded",
    discard: true,
  })

  log.info("init", { count: Object.keys(state.skills).length })
})

export class Service extends Context.Service<Service, Interface>()("@ravens/Skill") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const discovery = yield* Discovery.Service
    const config = yield* Config.Service
    const bus = yield* Bus.Service
    const fsys = yield* AppFileSystem.Service
    const global = yield* Global.Service
    const discovered = yield* InstanceState.make(
      Effect.fn("Skill.discovery")(function* (ctx) {
        return yield* discoverSkills(config, discovery, fsys, global, ctx.directory, ctx.worktree)
      }),
    )
    const state = yield* InstanceState.make(
      Effect.fn("Skill.state")(function* () {
        const s: State = { skills: {}, dirs: new Set() }
        // Register the built-in skill BEFORE disk discovery so a user-disk
        // skill with the same name can override it.
        s.skills[CUSTOMIZE_RAVENS_SKILL_NAME] = {
          name: CUSTOMIZE_RAVENS_SKILL_NAME,
          description: CUSTOMIZE_RAVENS_SKILL_DESCRIPTION,
          location: "<built-in>",
          content: CUSTOMIZE_RAVENS_SKILL_BODY,
        }
        yield* loadSkills(s, yield* InstanceState.get(discovered), bus)
        return s
      }),
    )

    const get = Effect.fn("Skill.get")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      return s.skills[name]
    })

    const all = Effect.fn("Skill.all")(function* () {
      const s = yield* InstanceState.get(state)
      return Object.values(s.skills).toSorted((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))
    })

    const dirs = Effect.fn("Skill.dirs")(function* () {
      return (yield* InstanceState.get(discovered)).dirs
    })

    const available = Effect.fn("Skill.available")(function* (agent?: Agent.Info) {
      const s = yield* InstanceState.get(state)
      const list = Object.values(s.skills).toSorted((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))
      if (!agent) return list
      return list.filter((skill) => Permission.evaluate("skill", skill.name, agent.permission).action !== "deny")
    })

    const reload = Effect.fn("Skill.reload")(function* () {
      yield* InstanceState.invalidate(discovered)
      yield* InstanceState.invalidate(state)
      log.info("skills reloaded")
      return true
    })

    const remove = Effect.fn("Skill.remove")(function* (name: string) {
      const s = yield* InstanceState.get(state)
      const skill = s.skills[name]
      if (!skill) {
        log.warn("skill remove: not found", { name })
        return false
      }
      if (skill.location === "<built-in>") {
        log.warn("skill remove: cannot remove built-in skill", { name })
        return false
      }
      const skillDir = path.dirname(skill.location)
      const ok = yield* Effect.tryPromise({
        try: async () => {
          // Delete the entire skill directory (e.g. skills/weather/),
          // not just the SKILL.md file, to avoid leaving empty dirs.
          try {
            await rm(skillDir, { recursive: true, force: true })
            return true as const
          } catch {
            // Fallback: delete the SKILL.md file only
            await Bun.file(skill.location).delete()
            return true as const
          }
        },
        catch: (err) => err,
      }).pipe(
        Effect.catch(
          Effect.fnUntraced(function* (err) {
            log.error("skill remove: failed to delete", { name, location: skill.location, skillDir, err })
            return false
          }),
        ),
      )
      if (!ok) return false

      yield* InstanceState.invalidate(discovered)
      yield* InstanceState.invalidate(state)
      log.info("skill removed", { name, location: skill.location })
      return true
    })

    const create = Effect.fnUntraced(function* (input: { name: string; description?: string; content: string }) {
      const skillsDir = path.join(global.home, ".config", "ravens", "skills", input.name)
      const filePath = path.join(skillsDir, "SKILL.md")

      // Build SKILL.md with YAML frontmatter
      const frontmatter = [`---`, `name: ${input.name}`]
      if (input.description) frontmatter.push(`description: ${input.description}`)
      frontmatter.push(`---`)
      const body = [...frontmatter, "", input.content].join("\n")

      yield* Effect.tryPromise({
        try: async () => {
          await mkdir(skillsDir, { recursive: true })
          await Bun.write(filePath, body)
        },
        catch: (err) => err,
      }).pipe(
        Effect.catch(
          Effect.fnUntraced(function* (err) {
            log.error("skill create: failed to write", { name: input.name, err })
            return yield* Effect.die(err)
          }),
        ),
      )

      yield* InstanceState.invalidate(discovered)
      yield* InstanceState.invalidate(state)
      const s = yield* InstanceState.get(state)
      const created = s.skills[input.name]
      if (!created) return yield* Effect.die(new Error(`Skill ${input.name} not found after creation`))
      return created
    })

    const update = Effect.fnUntraced(function* (name: string, input: { description?: string; content?: string }) {
      const s = yield* InstanceState.get(state)
      const existing = s.skills[name]
      if (!existing) return yield* Effect.die(new Error(`Skill ${name} not found`))
      if (existing.location === "<built-in>") return yield* Effect.die(new Error(`Cannot update built-in skill ${name}`))

      // Parse existing file to get current frontmatter + body
      const existingMd = yield* Effect.tryPromise({
        try: () => ConfigMarkdown.parse(existing.location),
        catch: (err) => err,
      }).pipe(
        Effect.catch(
          Effect.fnUntraced(function* (err) {
            log.error("skill update: failed to parse", { name, err })
            return yield* Effect.die(err)
          }),
        ),
      )

      const newDescription = input.description !== undefined ? input.description : existingMd.data?.description
      const newContent = input.content !== undefined ? input.content : existingMd.content

      // Rebuild SKILL.md
      const frontmatter = [`---`, `name: ${name}`]
      if (newDescription) frontmatter.push(`description: ${newDescription}`)
      frontmatter.push(`---`)
      const body = [...frontmatter, "", newContent].join("\n")

      yield* Effect.tryPromise({
        try: () => Bun.write(existing.location, body),
        catch: (err) => err,
      }).pipe(
        Effect.catch(
          Effect.fnUntraced(function* (err) {
            log.error("skill update: failed to write", { name, err })
            return yield* Effect.die(err)
          }),
        ),
      )

      yield* InstanceState.invalidate(discovered)
      yield* InstanceState.invalidate(state)
      const updated = (yield* InstanceState.get(state)).skills[name]
      if (!updated) return yield* Effect.die(new Error(`Skill ${name} not found after update`))
      return updated
    })

    return Service.of({ get, all, dirs, available, reload, remove, create, update })
  }),
)

export const defaultLayer = layer.pipe(
  Layer.provide(Discovery.defaultLayer),
  Layer.provide(Config.defaultLayer),
  Layer.provide(Bus.layer),
  Layer.provide(AppFileSystem.defaultLayer),
  Layer.provide(Global.layer),
)

export function fmt(list: Info[], opts: { verbose: boolean }) {
  const described = list.filter((skill) => skill.description !== undefined)
  if (described.length === 0) return "No skills are currently available."
  if (opts.verbose) {
    return [
      "<available_skills>",
      ...described
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .flatMap((skill) => [
          "  <skill>",
          `    <name>${skill.name}</name>`,
          `    <description>${skill.description}</description>`,
          `    <location>${pathToFileURL(skill.location).href}</location>`,
          "  </skill>",
        ]),
      "</available_skills>",
    ].join("\n")
  }

  return [
    "## Available Skills",
    ...described
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((skill) => `- **${skill.name}**: ${skill.description}`),
  ].join("\n")
}

export * as Skill from "."
