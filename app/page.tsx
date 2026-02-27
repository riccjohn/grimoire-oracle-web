"use client"

import * as Separator from "@radix-ui/react-separator"
import { useState } from "react"
import { ChatInput } from "@/components/ChatInput"
import { MessageList } from "@/components/MessageList"
import { ThemeToggle } from "@/components/ThemeToggle"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "0",
    role: "assistant",
    content:
      "Greetings, adventurer. I am the Grimoire Oracle — ask me anything about Old-School Essentials rules.",
  },
]

export default function Page() {
  // Stub state — replace with useChat when building app/api/chat/route.ts
  // TODO: const { messages, sendMessage, status } = useChat(...)
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)
  const [status, setStatus] = useState<"ready" | "streaming">("ready")

  const handleSend = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: "user", content: text },
    ])
    // TODO: replace with real sendMessage() from useChat
    // Stub: simulate a brief streaming state
    setStatus("streaming")
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content:
            "[Stub response] The chatbot API is not yet connected. Build lib/oracle-logic.ts and app/api/chat/route.ts to wire this up.",
        },
      ])
      setStatus("ready")
    }, 1200)
  }

  return (
    <main className="flex flex-col h-screen bg-bg font-mono overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 shrink-0">
        <div>
          <h1 className="font-mono font-bold text-lg bg-linear-to-r from-accent to-accent-2 bg-clip-text text-transparent">
            GRIMOIRE ORACLE
          </h1>
          <p className="font-mono text-xs text-fg-subtle">OSE rules lookup</p>
        </div>
        <ThemeToggle />
      </header>

      <Separator.Root className="h-px bg-bg-subtle shrink-0" />

      {/* Message list — fills remaining space */}
      <MessageList messages={messages} isStreaming={status === "streaming"} />

      <Separator.Root className="h-px bg-bg-subtle shrink-0" />

      {/* Input area */}
      <ChatInput onSubmit={handleSend} isDisabled={status !== "ready"} />

      {/* Status bar */}
      <footer className="px-4 py-1 shrink-0">
        <p className="font-mono text-xs text-fg-subtle">
          Enter to send · Shift+Enter for newline
        </p>
      </footer>
    </main>
  )
}
