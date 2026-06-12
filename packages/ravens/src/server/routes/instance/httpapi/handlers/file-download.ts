import * as InstanceState from "@/effect/instance-state"
import { AppFileSystem } from "@ravens-ai/core/filesystem"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { Effect, Schema } from "effect"
import * as Stream from "effect/Stream"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import path from "path"
import { containsPath } from "@/project/instance-context"

function parseRange(header: string | undefined, total: number): { start: number; end: number } | null {
  if (!header) return null
  const match = header.match(/^bytes=(\d+)-(\d*)$/)
  if (!match) return null
  const start = parseInt(match[1], 10)
  if (start >= total) return null
  const endRaw = match[2]
  const end = endRaw ? Math.min(parseInt(endRaw, 10), total - 1) : total - 1
  if (start > end) return null
  return { start, end }
}

export const fileDownloadRoute = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const appFs = yield* AppFileSystem.Service
    const sessionSvc = yield* Session.Service
    yield* router.add(
      "GET",
      "/file/download",
      Effect.gen(function* () {
        const ctx = yield* InstanceState.context
        const request = yield* HttpServerRequest.HttpServerRequest
        const query = yield* HttpServerRequest.schemaSearchParams(
          Schema.Struct({
            path: Schema.String,
            sessionID: Schema.optional(Schema.String),
          }),
        )

        // Resolve directory: prefer sessionID lookup, fall back to instance context
        let directory = ctx.directory
        if (query.sessionID) {
          const sid = SessionID.make(query.sessionID)
          const session = yield* sessionSvc.get(sid).pipe(
            Effect.catch(() => Effect.succeed(undefined)),
          )
          if (session) directory = session.directory
        }

        const filePath = query.path
        const full = path.join(directory, filePath)

        if (!containsPath(full, { ...ctx, directory })) {
          return HttpServerResponse.empty({ status: 403 })
        }

        const exists = yield* appFs.existsSafe(full)
        if (!exists) {
          return HttpServerResponse.empty({ status: 404 })
        }

        // Stat the file to get total size without reading content
        const stat = yield* appFs.stat(full).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        )
        const fileSize: number = stat?.size ? Number(stat.size) : 0

        const filename = path.basename(filePath)
        const mime = AppFileSystem.mimeType(full) || "application/octet-stream"
        const rangeHeader = request.headers["range"] || request.headers["Range"]

        const commonHeaders = {
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
          "Cache-Control": "no-cache",
          "Accept-Ranges": "bytes",
        }

        // Empty file — return 200 with empty body
        if (fileSize === 0) {
          return HttpServerResponse.uint8Array(new Uint8Array(), {
            contentType: mime,
            headers: commonHeaders,
          })
        }

        // Range request — stream only the requested bytes
        const range = parseRange(rangeHeader, fileSize)
        if (range) {
          const length = range.end - range.start + 1
          const byteStream = appFs.stream(full, { offset: range.start, bytesToRead: length }).pipe(
            Stream.catchCause(() => Stream.empty),
          )
          return HttpServerResponse.stream(byteStream, {
            status: 206,
            contentType: mime,
            headers: {
              ...commonHeaders,
              "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
              "Content-Length": String(length),
            },
          })
        }

        // Full file — stream without reading into memory
        const byteStream = appFs.stream(full).pipe(
          Stream.catchCause(() => Stream.empty),
        )
        return HttpServerResponse.stream(byteStream, {
          contentType: mime,
          headers: {
            ...commonHeaders,
            "Content-Length": String(fileSize),
          },
        })
      }),
    )
  }),
)
