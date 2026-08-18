import { ServerAuth } from "@/server/auth"
import { Effect, Redacted, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"

/**
 * Form-login endpoints backing the in-app sign-in page.
 *
 * These sit outside the authorization middleware (see `ServerAuth.AUTH_PATHS`)
 * because they have to answer before any credentials exist. A successful login
 * sets an HttpOnly cookie, which is what makes SSE work under auth —
 * EventSource can't attach an Authorization header but does send cookies.
 */

const LoginBody = Schema.Struct({
  username: Schema.optional(Schema.String),
  password: Schema.String,
})

function cookie(value: string, maxAgeSeconds: number, secure: boolean) {
  const parts = [
    `${ServerAuth.COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ]
  // Only mark Secure over HTTPS: a Secure cookie is dropped on plain HTTP,
  // which is how most self-hosted deployments are reached.
  if (secure) parts.push("Secure")
  return parts.join("; ")
}

function isSecureRequest(request: HttpServerRequest.HttpServerRequest) {
  if (request.headers["x-forwarded-proto"]?.split(",")[0]?.trim() === "https") return true
  return new URL(request.url, "http://localhost").protocol === "https:"
}

export const authRoutes = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const config = yield* ServerAuth.Config

    // Lets the UI decide between rendering the app and the sign-in page
    // without first provoking a 401.
    yield* router.add(
      "GET",
      "/auth/status",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const required = ServerAuth.required(config)
        const raw = request.headers.cookie ?? ""
        const token = raw
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith(`${ServerAuth.COOKIE_NAME}=`))
          ?.slice(ServerAuth.COOKIE_NAME.length + 1)
        return HttpServerResponse.jsonUnsafe({
          required,
          authenticated: !required || ServerAuth.sessionTokenMatches(token, config),
          username: config.username,
        })
      }),
    )

    yield* router.add(
      "POST",
      "/auth/login",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest

        if (!ServerAuth.required(config)) {
          // Nothing to sign in to; report success so the UI can just proceed.
          return HttpServerResponse.jsonUnsafe({ ok: true })
        }

        const body = yield* HttpServerRequest.schemaBodyJson(LoginBody).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        )
        if (!body) {
          return HttpServerResponse.jsonUnsafe({ ok: false, error: "invalid_request" }, { status: 400 })
        }

        const authorized = ServerAuth.authorized(
          { username: body.username ?? config.username, password: Redacted.make(body.password) },
          config,
        )
        if (!authorized) {
          return HttpServerResponse.jsonUnsafe({ ok: false, error: "invalid_credentials" }, { status: 401 })
        }

        return HttpServerResponse.jsonUnsafe(
          { ok: true },
          {
            headers: {
              "set-cookie": cookie(ServerAuth.sessionToken(config), 60 * 60 * 24 * 30, isSecureRequest(request)),
            },
          },
        )
      }),
    )

    yield* router.add(
      "POST",
      "/auth/logout",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        return HttpServerResponse.jsonUnsafe(
          { ok: true },
          { headers: { "set-cookie": cookie("", 0, isSecureRequest(request)) } },
        )
      }),
    )
  }),
)
