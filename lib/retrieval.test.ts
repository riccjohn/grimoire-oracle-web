import { supabaseClient } from "@/lib/supabase-client"
import { retrieveContext, retrieveRawChunks } from "./retrieval"

vi.mock("@ai-sdk/cohere", () => ({
  cohere: { embeddingModel: vi.fn().mockReturnValue("mock-model") },
}))

vi.mock("ai", () => ({
  embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3] }),
}))

vi.mock("@/lib/supabase-client", () => ({
  supabaseClient: { rpc: vi.fn() },
}))

vi.mock("@/lib/constants", () => ({
  DEBUG: false,
  EMBEDDING_MODEL: "embed-english-v3.0",
  RETRIEVAL_K: 5,
  SUPABASE_MATCH_DOCUMENTS_FUNCTION: "match_documents",
}))

const mockRpc = vi.mocked(supabaseClient.rpc)

describe("retrieval", () => {
  describe("retrieveRawChunks", () => {
    it("throws when Supabase returns an error", async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: {
          message: "connection failed",
          details: "",
          hint: "",
          code: "",
          name: "PostgrestError",
        },
        count: null,
        status: 500,
        statusText: "Internal Server Error",
      })
      await expect(retrieveRawChunks("test query")).rejects.toThrow(
        "connection failed"
      )
    })
  })

  describe("retrieveContext", () => {
    it("maps content and joins chunks with \\n\\n", async () => {
      mockRpc.mockResolvedValue({
        data: [
          {
            id: 1,
            content: "chunk one",
            metadata: { source: "a.md", title: "A" },
            similarity: 0.9,
          },
          {
            id: 2,
            content: "chunk two",
            metadata: { source: "b.md", title: "B" },
            similarity: 0.8,
          },
        ],
        error: null,
        count: null,
        status: 200,
        statusText: "OK",
      })
      const result = await retrieveContext("test query")
      expect(result).toBe("chunk one\n\nchunk two")
    })
  })
})
