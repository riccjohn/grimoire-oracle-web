import { render, screen } from "@testing-library/react"
import type { UIMessage } from "ai"
import { MessageList } from "./MessageList"

window.HTMLElement.prototype.scrollIntoView = vi.fn()

function makeMessage(
  role: UIMessage["role"],
  text: string,
  id = crypto.randomUUID()
): UIMessage {
  return { id, role, parts: [{ type: "text", text }] }
}

describe("MessageList", () => {
  it("shows placeholder when there are no messages", () => {
    render(<MessageList messages={[]} status="ready" />)
    expect(screen.getByText(/oracle awaits/i)).toBeInTheDocument()
  })

  it("renders all messages", () => {
    const messages = [
      makeMessage("user", "What is THAC0?"),
      makeMessage("assistant", "THAC0 stands for..."),
    ]
    render(<MessageList messages={messages} status="ready" />)
    expect(screen.getByText("What is THAC0?")).toBeInTheDocument()
    expect(screen.getByText("THAC0 stands for...")).toBeInTheDocument()
  })

  it("shows 'Consulting the grimoire' when status is submitted and last message is from user", () => {
    const messages = [makeMessage("user", "Hello")]
    render(<MessageList messages={messages} status="submitted" />)
    expect(screen.getByText(/consulting the grimoire/i)).toBeInTheDocument()
  })

  it("does not show loading indicator when status is ready", () => {
    const messages = [makeMessage("user", "Hello")]
    render(<MessageList messages={messages} status="ready" />)
    expect(
      screen.queryByText(/consulting the grimoire/i)
    ).not.toBeInTheDocument()
  })

  it("marks the last assistant message as streaming during streaming status", () => {
    const messages = [
      makeMessage("user", "Hello", "1"),
      makeMessage("assistant", "Hi there", "2"),
    ]
    render(<MessageList messages={messages} status="streaming" />)
    expect(screen.getByText("█")).toBeInTheDocument()
  })
})
