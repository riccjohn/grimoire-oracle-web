import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ThemeToggle } from "./ThemeToggle"

describe("ThemeToggle", () => {
  afterEach(() => {
    cleanup() // unmount before touching the DOM to avoid MutationObserver act() warnings
    document.documentElement.classList.remove("dark")
    localStorage.clear()
  })

  it("shows 'Dark' button when dark mode is off", () => {
    render(<ThemeToggle />)
    expect(
      screen.getByRole("button", { name: /toggle theme/i }),
    ).toHaveTextContent("◑ Dark")
  })

  it("shows 'Light' button when dark mode is on", () => {
    document.documentElement.classList.add("dark")
    render(<ThemeToggle />)
    expect(
      screen.getByRole("button", { name: /toggle theme/i }),
    ).toHaveTextContent("◑ Light")
  })

  it("enables dark mode and saves to localStorage on click", async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)
    await user.click(screen.getByRole("button", { name: /toggle theme/i }))
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(localStorage.getItem("theme")).toBe("dark")
  })

  it("disables dark mode on second click", async () => {
    const user = userEvent.setup()
    document.documentElement.classList.add("dark")
    render(<ThemeToggle />)
    await user.click(screen.getByRole("button", { name: /toggle theme/i }))
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(false),
    )
    expect(localStorage.getItem("theme")).toBe("light")
  })
})
