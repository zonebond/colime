import { Document } from "@/document/document"
import { DocumentID } from "@/document/schema"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { ApiNotFoundError } from "../errors"
import { described } from "./metadata"

const root = "/document"

export const DocumentApi = HttpApi.make("document")
  .add(
    HttpApiGroup.make("document")
      .add(
        HttpApiEndpoint.get("list", root, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Document.Info), "List of documents"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "document.list",
            summary: "List all documents",
            description: "Get all documents in the library.",
          }),
        ),
        HttpApiEndpoint.get("get", `${root}/:documentID`, {
          params: { documentID: DocumentID },
          query: WorkspaceRoutingQuery,
          success: described(Document.Info, "Document details"),
          error: ApiNotFoundError,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "document.get",
            summary: "Get document",
            description: "Get a single document by ID.",
          }),
        ),
        HttpApiEndpoint.post("create", root, {
          query: WorkspaceRoutingQuery,
          payload: Document.CreateInput,
          success: described(Document.Info, "Created document"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "document.create",
            summary: "Create document",
            description: "Create a new document in the library.",
          }),
        ),
        HttpApiEndpoint.patch("update", `${root}/:documentID`, {
          params: { documentID: DocumentID },
          query: WorkspaceRoutingQuery,
          payload: Document.UpdateInput,
          success: described(Document.Info, "Updated document"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "document.update",
            summary: "Update document",
            description: "Update an existing document's title, content, type, or tags.",
          }),
        ),
        HttpApiEndpoint.delete("remove", `${root}/:documentID`, {
          params: { documentID: DocumentID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Deleted document"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "document.delete",
            summary: "Delete document",
            description: "Delete a document from the library.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "document",
          description: "Document library management routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "ravens experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
