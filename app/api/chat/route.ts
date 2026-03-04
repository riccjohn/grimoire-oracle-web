import { anthropic } from "@ai-sdk/anthropic"
import {
  convertToModelMessages,
  streamText,
  type TextUIPart,
  type UIMessage,
} from "ai"
import { CHATBOT_MODEL, DEBUG } from "@/lib/constants"
import { retrieveContext } from "@/lib/retrieval"

export const POST = async (req: Request) => {
  const body = await req.json()
  const { messages }: { messages: UIMessage[] } = body

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("messages must be a non-empty array", { status: 400 })
  }

  const [lastMessage] = messages.slice(-1)
  const input =
    lastMessage?.parts
      .filter((p): p is TextUIPart => p.type === "text")
      .map((p) => p.text)
      .join("") ?? ""

  if (DEBUG) console.log("[route] input:", input)

  const context = await retrieveContext(input)

  const system = `You are the Grimoire Oracle, a wizard knowledgeable in TTRPG rules like Old School Essentials (BX D&D). Answer questions using ONLY the context provided below. IMPORTANT: If the context does not contain the answer, say "The Oracle did not return any results for that rule." Do NOT make up or invent any rules, numbers, or game mechanics. Context: ${context}`

  const result = streamText({
    model: anthropic(CHATBOT_MODEL),
    system,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}
