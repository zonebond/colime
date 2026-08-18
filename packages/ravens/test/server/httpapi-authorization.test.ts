import { NodeHttpServer } from "@effect/platform-node"
import { describe, expect } from "bun:test"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi"
import { ServerAuth } from "../../src/server/auth"
import { Authorization, authorizationLayer } from "../../src/server/routes/instance/httpapi/middleware/authorization"
import { testEffect } from "../lib/effect"

const Api = HttpApi.make("test-authorization").add(
  HttpApiGroup.make("test")
    .add(
      HttpApiEndpoint.get("probe", "/probe", {
        success: Schema.String,
      }),
      HttpApiEndpoint.get("missing", "/missing", {
        success: Schema.String,
        error: HttpApiError.NotFound,
      }),
    )
    .middleware(Authorization),
)

const handlers = HttpApiBuilder.group(Api, "test", (handlers) =>
  handlers
    .handle("probe", () => Effect.succeed("ok"))
    .handle("missing", () => Effect.fail(new HttpApiError.NotFound({}))),
)

const apiLayer = HttpRouter.serve(
  HttpApiBuilder.layer(Api).pipe(Layer.provide(handlers), Layer.provide(authorizationLayer)),
  { disableListenLog: true, disableLogger: true },
).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

const noAuthLayer = ServerAuth.Config.layer({ password: Option.none(), username: "ravens" })
const secretLayer = ServerAuth.Config.layer({ password: Option.some("secret"), username: "ravens" })
const kitSecretLayer = ServerAuth.Config.layer({ password: Option.some("secret"), username: "kit" })

const it = testEffect(apiLayer.pipe(Layer.provide(noAuthLayer)))
const itSecret = testEffect(apiLayer.pipe(Layer.provide(secretLayer)))
const itKitSecret = testEffect(apiLayer.pipe(Layer.provide(kitSecretLayer)))

const basic = (username: string, password: string) => ServerAuth.header({ username, password }) ?? ""

const token = (username: string, password: string) => Buffer.from(`${username}:${password}`).toString("base64")

const getProbe = (headers?: Record<string, string>) =>
  HttpClientRequest.get("/probe").pipe(
    headers ? HttpClientRequest.setHeaders(headers) : (request) => request,
    HttpClient.execute,
  )

describe("HttpApi authorization middleware", () => {
  it.live("allows requests when server password is not configured", () =>
    Effect.gen(function* () {
      const response = yield* getProbe()

      expect(response.status).toBe(200)
      expect(yield* response.json).toBe("ok")
    }),
  )

  itSecret.live("requires configured password for basic auth", () =>
    Effect.gen(function* () {
      const [missing, badPassword, good] = yield* Effect.all(
        [
          getProbe(),
          getProbe({ authorization: basic("ravens", "wrong") }),
          getProbe({ authorization: basic("ravens", "secret") }),
        ],
        { concurrency: "unbounded" },
      )

      expect(missing.status).toBe(401)
      expect(badPassword.status).toBe(401)
      expect(good.status).toBe(200)

      // No Basic challenge on 401: it makes the browser pop its own native
      // credential dialog, which the in-app sign-in page replaces. Clients
      // that use Basic send the header proactively rather than waiting to be
      // challenged, so nothing depends on it.
      expect(missing.headers["www-authenticate"]).toBeUndefined()
      expect(badPassword.headers["www-authenticate"]).toBeUndefined()
    }),
  )

  itSecret.live("accepts the session cookie issued by the login endpoint", () =>
    Effect.gen(function* () {
      const config = { password: Option.some("secret"), username: "ravens" }
      const valid = ServerAuth.sessionToken(config)

      const [good, wrong, malformed] = yield* Effect.all(
        [
          getProbe({ cookie: `${ServerAuth.COOKIE_NAME}=${valid}` }),
          getProbe({ cookie: `${ServerAuth.COOKIE_NAME}=not-the-token` }),
          getProbe({ cookie: `unrelated=1; ${ServerAuth.COOKIE_NAME}=` }),
        ],
        { concurrency: "unbounded" },
      )

      // This is what makes SSE work under auth: EventSource can't set an
      // Authorization header, but the browser does send cookies.
      expect(good.status).toBe(200)
      expect(wrong.status).toBe(401)
      expect(malformed.status).toBe(401)
    }),
  )

  itSecret.live("does not carry a session cookie across differing credentials", () =>
    Effect.gen(function* () {
      // A token minted for another password must not open this server — the
      // token is derived from the configured credentials.
      const otherToken = ServerAuth.sessionToken({ password: Option.some("other"), username: "ravens" })
      const response = yield* getProbe({ cookie: `${ServerAuth.COOKIE_NAME}=${otherToken}` })
      expect(response.status).toBe(401)
    }),
  )

  itKitSecret.live("respects configured basic auth username", () =>
    Effect.gen(function* () {
      const [defaultUser, configuredUser] = yield* Effect.all(
        [getProbe({ authorization: basic("ravens", "secret") }), getProbe({ authorization: basic("kit", "secret") })],
        { concurrency: "unbounded" },
      )

      expect(defaultUser.status).toBe(401)
      expect(configuredUser.status).toBe(200)
    }),
  )

  itSecret.live("accepts auth token query credentials", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get(`/probe?auth_token=${encodeURIComponent(token("ravens", "secret"))}`)

      expect(response.status).toBe(200)
    }),
  )

  itSecret.live("prefers auth token query credentials over basic auth", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.get(
        `/probe?auth_token=${encodeURIComponent(token("ravens", "secret"))}`,
      ).pipe(HttpClientRequest.setHeader("authorization", basic("ravens", "wrong")), HttpClient.execute)

      expect(response.status).toBe(200)
    }),
  )

  itSecret.live("preserves handler errors when basic auth succeeds", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.get("/missing").pipe(
        HttpClientRequest.setHeader("authorization", basic("ravens", "secret")),
        HttpClient.execute,
      )

      expect(response.status).toBe(404)
    }),
  )

  itSecret.live("preserves handler errors when auth token query succeeds", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get(`/missing?auth_token=${encodeURIComponent(token("ravens", "secret"))}`)

      expect(response.status).toBe(404)
    }),
  )

  itSecret.live("rejects malformed auth token query credentials", () =>
    Effect.gen(function* () {
      const response = yield* HttpClient.get("/probe?auth_token=not-base64")

      expect(response.status).toBe(401)
    }),
  )
})
