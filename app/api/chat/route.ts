import { toUIMessageStream } from "@ai-sdk/langchain"
import { createUIMessageStreamResponse, UIMessage } from "ai"
import { DEBUG } from "@/lib/constants"
import { createOracleChain } from "@/lib/oracle-logic"

export const POST = async (req: Request) => {
  const body = await req.json()
  const { messages }: { messages: UIMessage[] } = body
  const [lastMessage] = messages.slice(-1)
  const input = lastMessage?.parts
    .filter(p => p.type === "text")
    .map(p => p.text)
    .join("") ?? ""

  if (DEBUG) console.log("[route] input:", input)

  const chain = await createOracleChain()

  // Use streamEvents to emit fine-grained chain events (including individual LLM tokens)
  const langchainStream = chain.streamEvents({ input }, { version: "v2" })

  // Convert the LangChain stream to a format the AI SDK understands
  const uiStream = toUIMessageStream(langchainStream)

  return createUIMessageStreamResponse({ stream: uiStream })
}
