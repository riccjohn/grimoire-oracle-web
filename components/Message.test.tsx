import { render, screen } from "@testing-library/react"
import { Message } from "./Message"

describe("Message", () => {
  it("shows '> You' label for user role", () => {
    render(<Message role="user" content="Hello" />)
    expect(screen.getByText("> You")).toBeInTheDocument()
  })

  it("shows '🧙 Oracle' label for assistant role", () => {
    render(<Message role="assistant" content="Hello" />)
    expect(screen.getByText("🧙 Oracle")).toBeInTheDocument()
  })

  it("renders content", () => {
    render(<Message role="user" content="What is AC?" />)
    expect(screen.getByText("What is AC?")).toBeInTheDocument()
  })

  it("shows streaming cursor when isStreaming is true", () => {
    render(<Message role="assistant" content="Thinking" isStreaming />)
    expect(screen.getByText("█")).toBeInTheDocument()
  })

  it("hides streaming cursor by default", () => {
    render(<Message role="assistant" content="Done" />)
    expect(screen.queryByText("█")).not.toBeInTheDocument()
  })
})
