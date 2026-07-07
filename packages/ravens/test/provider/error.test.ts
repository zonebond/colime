import { describe, expect, test } from "bun:test"
import { APICallError } from "ai"
import { ProviderError } from "../../src/provider/error"
import { ProviderID } from "../../src/provider/schema"

const providerID = ProviderID.make("test")

function apiError(message: string, statusCode = 400) {
  return new APICallError({
    message,
    url: "https://example.com/v1/chat/completions",
    requestBodyValues: {},
    statusCode,
    responseBody: message,
  })
}

function classify(message: string, statusCode = 400) {
  return ProviderError.parseAPICallError({ providerID, error: apiError(message, statusCode) }).type
}

describe("provider.error overflow classification", () => {
  test("classifies Anthropic overflow", () => {
    expect(classify("prompt is too long: 210000 tokens > 200000 maximum")).toBe("context_overflow")
  })

  test("classifies OpenAI-compatible overflow", () => {
    expect(classify("This model's maximum context length is 65536 tokens.")).toBe("context_overflow")
  })

  test("classifies DashScope (Qwen) range overflow", () => {
    expect(classify("Range of input length should be [1, 129024]")).toBe("context_overflow")
  })

  test("classifies DashScope (Qwen) length overflow", () => {
    expect(classify("Input length exceeds the maximum length limit")).toBe("context_overflow")
  })

  test("classifies Volcano Ark (Doubao) overflow", () => {
    expect(classify("InvalidParameter: prompt tokens too long")).toBe("context_overflow")
  })

  test("classifies Chinese overflow message (超过最大长度)", () => {
    expect(classify("请求的 tokens 超过了模型最大上下文长度")).toBe("context_overflow")
  })

  test("classifies Chinese overflow message (输入超出限制)", () => {
    expect(classify("输入长度超出模型上限，请压缩会话后重试")).toBe("context_overflow")
  })

  test("classifies HTTP 413 as overflow", () => {
    expect(classify("Request Entity Too Large", 413)).toBe("context_overflow")
  })

  test("does not classify Chinese rate-limit message as overflow", () => {
    expect(classify("请求过于频繁，请稍后重试", 429)).toBe("api_error")
  })

  test("does not classify TPM rate-limit as overflow", () => {
    expect(classify("Too many tokens per minute, please slow down", 429)).toBe("api_error")
  })

  test("does not classify generic errors as overflow", () => {
    expect(classify("Invalid API key provided", 401)).toBe("api_error")
  })
})
