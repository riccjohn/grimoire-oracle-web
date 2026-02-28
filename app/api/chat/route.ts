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

  // Use streamEvents to emit fine-grained chain events (including individual LLM tokens)
  const langchainStream = chain.streamEvents({ input }, { version: "v2" })

  // Convert the LangChain stream to a format the AI SDK understands
  const uiStream = toUIMessageStream(langchainStream)

  return createUIMessageStreamResponse({ stream: uiStream })
}
