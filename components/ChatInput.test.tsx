import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ChatInput } from "./ChatInput"

describe("ChatInput", () => {
  it("renders a textarea and submit button", () => {
    render(<ChatInput onSubmit={vi.fn()} />)
    expect(screen.getByRole("textbox")).toBeInTheDocument()
    expect(screen.getByRole("button")).toBeInTheDocument()
  })

  it("calls onSubmit with trimmed value on button click", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ChatInput onSubmit={onSubmit} />)
    await user.type(screen.getByRole("textbox"), "  hello  ")
    await user.click(screen.getByRole("button"))
    expect(onSubmit).toHaveBeenCalledWith("hello")
  })

  it("calls onSubmit on Enter key", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ChatInput onSubmit={onSubmit} />)
    await user.type(screen.getByRole("textbox"), "spell{Enter}")
    expect(onSubmit).toHaveBeenCalledWith("spell")
  })

  it("does not call onSubmit on Shift+Enter", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ChatInput onSubmit={onSubmit} />)
    await user.type(screen.getByRole("textbox"), "spell")
    await user.keyboard("{Shift>}{Enter}{/Shift}")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("clears the textarea after submit", async () => {
    const user = userEvent.setup()
    render(<ChatInput onSubmit={vi.fn()} />)
    const textarea = screen.getByRole("textbox")
    await user.type(textarea, "hello")
    await user.click(screen.getByRole("button"))
    expect(textarea).toHaveValue("")
  })

  it("does not call onSubmit when textarea is empty", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ChatInput onSubmit={onSubmit} />)
    await user.click(screen.getByRole("button"))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("button is disabled when textarea is empty", () => {
    render(<ChatInput onSubmit={vi.fn()} />)
    expect(screen.getByRole("button")).toBeDisabled()
  })

  it("textarea and button are disabled when isDisabled is true", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ChatInput onSubmit={onSubmit} isDisabled />)
    expect(screen.getByRole("textbox")).toBeDisabled()
    expect(screen.getByRole("button")).toBeDisabled()
    await user.type(screen.getByRole("textbox"), "test{Enter}")
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
