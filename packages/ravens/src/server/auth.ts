export * as ServerAuth from "./auth"

import { ConfigService } from "@/effect/config-service"
import { Flag } from "@ravens-ai/core/flag/flag"
import { Config as EffectConfig, Context, Option, Redacted } from "effect"
import { createHash, timingSafeEqual } from "node:crypto"

export type Credentials = {
  password?: string
  username?: string
}

export type DecodedCredentials = {
  readonly username: string
  readonly password: Redacted.Redacted
}

export class Config extends ConfigService.Service<Config>()("@ravens/ServerAuthConfig", {
  password: EffectConfig.string("RAVENS_SERVER_PASSWORD").pipe(EffectConfig.option),
  username: EffectConfig.string("RAVENS_SERVER_USERNAME").pipe(EffectConfig.withDefault("ravens")),
}) {}

export type Info = Context.Service.Shape<typeof Config>

export function required(config: Info) {
  return Option.isSome(config.password) && config.password.value !== ""
}

export function authorized(credentials: DecodedCredentials, config: Info) {
  return (
    Option.isSome(config.password) &&
    credentials.username === config.username &&
    Redacted.value(credentials.password) === config.password.value
  )
}

/** Name of the session cookie set after a successful form login. */
export const COOKIE_NAME = "ravens_auth"

/**
 * Endpoints the login flow itself needs, so they must answer before any
 * credentials exist. Neither reveals anything: /auth/status only reports
 * whether a password is configured, and /auth/login is the check.
 */
export const AUTH_PATHS = new Set<string>(["/auth/status", "/auth/login", "/auth/logout"])

export function isAuthEndpoint(pathname: string) {
  return AUTH_PATHS.has(pathname)
}

/**
 * Token stored in the session cookie.
 *
 * Derived from the configured credentials rather than holding them, so the
 * browser jar never carries the password itself. Basic auth already sends the
 * password on every request, so this is strictly no weaker — and it's what
 * lets SSE work, since EventSource can't attach an Authorization header but
 * does send cookies.
 */
export function sessionToken(config: Info) {
  const password = Option.isSome(config.password) ? config.password.value : ""
  return createHash("sha256").update(`${config.username}:${password}`).digest("base64url")
}

/** Constant-time compare so a wrong cookie can't be probed byte by byte. */
export function sessionTokenMatches(candidate: string | undefined, config: Info) {
  if (!candidate) return false
  const expected = sessionToken(config)
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function header(credentials?: Credentials) {
  const password = credentials?.password ?? Flag.RAVENS_SERVER_PASSWORD
  if (!password) return undefined

  const username = credentials?.username ?? Flag.RAVENS_SERVER_USERNAME ?? "ravens"
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
}

export function headers(credentials?: Credentials) {
  const authorization = header(credentials)
  if (!authorization) return undefined
  return { Authorization: authorization }
}
