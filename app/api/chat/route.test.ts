import type { UIMessage } from "ai"
import { POST } from "./route"

vi.mock("@/lib/constants", () => ({
  CHATBOT_ENABLED: false,
  CHATBOT_MODEL: "claude-haiku-4-5",
  DEBUG: false,
}))

vi.mock("@/lib/retrieval", () => ({
  retrieveContext: vi.fn().mockResolvedValue("mocked context"),
}))

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makeMessages(text = "hello"): UIMessage[] {
  return [{ id: "1", role: "user", parts: [{ type: "text", text }] }]
}

describe("POST /api/chat", () => {
  it("returns 400 when messages is an empty array", async () => {
    const res = await POST(makeRequest({ messages: [] }))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe("messages must be a non-empty array")
  })

  it("returns 400 when body has no messages field", async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe("messages must be a non-empty array")
  })

  it("returns the offline message when CHATBOT_ENABLED is false", async () => {
    const res = await POST(makeRequest({ messages: makeMessages() }))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain("The Oracle is currently offline.")
  })
})
