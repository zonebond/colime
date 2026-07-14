import * as InstanceState from "@/effect/instance-state"
import { AppFileSystem } from "@ravens-ai/core/filesystem"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { Effect, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import path from "path"
import { containsPath } from "@/project/instance-context"

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const ATTACHMENTS_DIR = "attachments"

/** Strip any path components and control characters from a client-supplied name. */
function sanitizeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const base = path.basename(name).replace(/[\u0000-\u001f\u007f]/g, "").trim()
  return base && base !== "." && base !== ".." ? base : "file"
}

/** report.pdf → report-2.pdf */
function withSuffix(name: string, n: number): string {
  const ext = path.extname(name)
  const stem = name.slice(0, name.length - ext.length)
  return `${stem}-${n}${ext}`
}

/**
 * Raw-body attachment upload into the session working directory.
 *
 * POST /file/upload?filename=...&sessionID=...
 * Body: the file bytes (no multipart — one file per request keeps the
 * endpoint trivial and upload progress still works via XHR).
 *
 * Writes to {sessionDir}/attachments/{filename}, suffixing on name
 * collisions, and returns { name, path, size, mime } where path is
 * relative to the session directory.
 */
export const fileUploadRoute = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const appFs = yield* AppFileSystem.Service
    const sessionSvc = yield* Session.Service
    yield* router.add(
      "POST",
      "/file/upload",
      Effect.gen(function* () {
        const ctx = yield* InstanceState.context
        const request = yield* HttpServerRequest.HttpServerRequest
        const query = yield* HttpServerRequest.schemaSearchParams(
          Schema.Struct({
            filename: Schema.String,
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

        const declaredSize = Number(request.headers["content-length"] ?? "0")
        if (declaredSize > MAX_UPLOAD_BYTES) {
          return HttpServerResponse.text("File too large", { status: 413 })
        }

        const body = yield* request.arrayBuffer.pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        )
        if (!body || body.byteLength === 0) {
          return HttpServerResponse.text("Empty upload body", { status: 400 })
        }
        const bytes = new Uint8Array(body)
        if (bytes.byteLength > MAX_UPLOAD_BYTES) {
          return HttpServerResponse.text("File too large", { status: 413 })
        }

        const safeName = sanitizeFilename(query.filename)
        const targetDir = path.join(directory, ATTACHMENTS_DIR)

        let candidate = safeName
        for (let n = 2; yield* appFs.existsSafe(path.join(targetDir, candidate)); n++) {
          if (n > 500) {
            return HttpServerResponse.text("Too many name collisions", { status: 409 })
          }
          candidate = withSuffix(safeName, n)
        }

        const full = path.join(targetDir, candidate)
        if (!containsPath(full, { ...ctx, directory })) {
          return HttpServerResponse.empty({ status: 403 })
        }

        const written = yield* appFs.writeWithDirs(full, bytes).pipe(
          Effect.map(() => true),
          Effect.catch(() => Effect.succeed(false)),
        )
        if (!written) {
          return HttpServerResponse.text("Write failed", { status: 500 })
        }

        const mime =
          AppFileSystem.mimeType(full) ||
          request.headers["content-type"] ||
          "application/octet-stream"

        return HttpServerResponse.text(
          JSON.stringify({
            name: candidate,
            path: `${ATTACHMENTS_DIR}/${candidate}`,
            size: bytes.byteLength,
            mime,
          }),
          { contentType: "application/json" },
        )
      }),
    )
  }),
)
