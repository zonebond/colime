// @ts-nocheck

import { OpenCode } from "@ravens-ai/core"
import { ReadTool } from "@ravens-ai/core/tools"

const ravens = OpenCode.make({})

opencode.tool.add(ReadTool)

opencode.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

opencode.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

opencode.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await ravens.session.create({
  agent: "build",
})

opencode.subscribe((event) => {
  console.log(event)
})

await ravens.session.prompt({
  sessionID,
  text: "hey what is up",
})

await ravens.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await ravens.session.wait()

console.log(await ravens.session.messages(sessionID))
