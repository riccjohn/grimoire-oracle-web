import { toUIMessageStream } from "@ai-sdk/langchain"
import { createUIMessageStreamResponse } from "ai"
import type { ChatMessage } from "@/app/page"
import { createOracleChain } from "@/lib/oracle-logic"

export const POST = async (req: Request) => {
  const body = await req.json()
  const { messages }: { messages: ChatMessage[] } = body
  const [lastMessage] = messages.slice(-1)
  const input = lastMessage?.content ?? ""

  const chain = await createOracleChain()

  // Stream only the "answer" key from the retrieval chain output (ignores the "context" docs)
  const langchainStream = await chain.pick("answer").stream({ input })

  // Convert the LangChain stream to a format the AI SDK understands
  const uiStream = toUIMessageStream(langchainStream)

  return createUIMessageStreamResponse({ stream: uiStream })
}
