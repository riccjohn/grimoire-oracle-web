"use client"

import * as ScrollArea from "@radix-ui/react-scroll-area"
import { useEffect, useRef } from "react"
import { Message } from "./Message"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

type Props = {
  messages: ChatMessage[]
  isStreaming?: boolean
}

export function MessageList({ messages, isStreaming = false }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <ScrollArea.Root className="flex-1 overflow-hidden">
      <ScrollArea.Viewport className="h-full w-full px-4 py-4">
        {messages.length === 0 && (
          <p className="font-mono text-sm text-fg-subtle text-center mt-8">
            The oracle awaits your question...
          </p>
        )}
        {messages.map((msg, i) => (
          <Message
            key={msg.id}
            role={msg.role}
            content={msg.content}
            isStreaming={
              isStreaming &&
              i === messages.length - 1 &&
              msg.role === "assistant"
            }
          />
        ))}
        <div ref={bottomRef} />
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        orientation="vertical"
        className="flex touch-none select-none w-1.5 p-0.5 transition-colors"
      >
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-accent opacity-40 hover:opacity-70 transition-opacity" />
      </ScrollArea.Scrollbar>
      <ScrollArea.Corner />
    </ScrollArea.Root>
  )
}
