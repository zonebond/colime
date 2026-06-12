export * as ConfigPaths from "./paths"

import path from "path"
import { Flag } from "@ravens-ai/core/flag/flag"
import { Global } from "@ravens-ai/core/global"
import { unique } from "remeda"
import * as Effect from "effect/Effect"
import { AppFileSystem } from "@ravens-ai/core/filesystem"

export const files = Effect.fn("ConfigPaths.projectFiles")(function* (
  name: string,
  directory: string,
  worktree?: string,
) {
  const afs = yield* AppFileSystem.Service
  return (yield* afs.up({
    targets: [`${name}.jsonc`, `${name}.json`],
    start: directory,
    stop: worktree,
  })).toReversed()
})

export const directories = Effect.fn("ConfigPaths.directories")(function* (directory: string, worktree?: string) {
  const afs = yield* AppFileSystem.Service
  return unique([
    Global.Path.config,
    // Always include the standard XDG config dir even if RAVENS_CONFIG_DIR
    // overrides Global.Path.config — users expect ~/.config/ravens/skills/ to work.
    Global.Path.defaultConfig,
    ...(!Flag.RAVENS_DISABLE_PROJECT_CONFIG
      ? yield* afs.up({
          targets: [".ravens"],
          start: directory,
          stop: worktree,
        })
      : []),
    ...(yield* afs.up({
      targets: [".ravens"],
      start: Global.Path.home,
      stop: Global.Path.home,
    })),
    ...(Flag.RAVENS_CONFIG_DIR ? [Flag.RAVENS_CONFIG_DIR] : []),
  ])
})

export function fileInDirectory(dir: string, name: string) {
  return [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)]
}
