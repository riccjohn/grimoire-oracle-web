"use client"

import * as ScrollArea from "@radix-ui/react-scroll-area"
import { ChatStatus, UIMessage } from "ai"
import { useEffect, useRef } from "react"
import { Message } from "./Message"

type Props = {
  messages: UIMessage[]
  status: ChatStatus
}

export function MessageList({ messages, status }: Props) {
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
        {messages.map((msg, i) => {
          const content = msg.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join("")

          return (
            <Message
              key={msg.id}
              role={msg.role}
              content={content}
              isStreaming={
                status === "streaming" &&
                i === messages.length - 1 &&
                msg.role === "assistant"
              }
            />
          )
        })}
        {status === "submitted" && messages.at(-1)?.role === "user" && (
          <div className="pl-3 py-1 mb-4 border-l-2 border-bg-subtle">
            <p className="font-mono text-xs text-fg-subtle mb-1 select-none">🧙 Oracle</p>
            <p className="font-mono text-sm text-fg-subtle animate-pulse">
              Consulting the grimoire…
            </p>
          </div>
        )}
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
