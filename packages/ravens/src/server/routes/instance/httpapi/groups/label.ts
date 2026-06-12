import { Label } from "@/label/label"
import { LabelID } from "@/label/schema"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

const root = "/label"

export const LabelApi = HttpApi.make("label")
  .add(
    HttpApiGroup.make("label")
      .add(
        HttpApiEndpoint.get("list", root, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Label.Info), "List of labels"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "label.list",
            summary: "List all labels",
            description: "Get all labels (groups) used to organize sessions.",
          }),
        ),
        HttpApiEndpoint.post("create", root, {
          query: WorkspaceRoutingQuery,
          payload: Label.CreateInput,
          success: described(Label.Info, "Created label"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "label.create",
            summary: "Create label",
            description: "Create a new label for grouping sessions.",
          }),
        ),
        HttpApiEndpoint.patch("update", `${root}/:labelID`, {
          params: { labelID: LabelID },
          query: WorkspaceRoutingQuery,
          payload: Label.UpdateInput,
          success: described(Label.Info, "Updated label"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "label.update",
            summary: "Update label",
            description: "Rename an existing label.",
          }),
        ),
        HttpApiEndpoint.delete("remove", `${root}/:labelID`, {
          params: { labelID: LabelID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Deleted label"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "label.delete",
            summary: "Delete label",
            description: "Delete a label and remove it from all sessions.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "label",
          description: "Label (group) management routes.",
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
