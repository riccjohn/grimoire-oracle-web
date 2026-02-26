# Terminal Chat UI — Research Artifact
**Date:** 2026-02-26
**Feature:** Chat UI with terminal aesthetic (Crush-inspired), dark/light theme, Radix UI, Vercel AI SDK

---

## 1. Codebase Findings

**Files examined:** `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `postcss.config.mjs`, `package.json`

### Current styling setup
- **Tailwind v4** fully configured — `@import "tailwindcss"` in `globals.css`, processed via `@tailwindcss/postcss`
- **`@theme inline`** already in use; custom tokens defined as CSS vars mapped into Tailwind:
  ```css
  :root { --background: #ffffff; --foreground: #171717; }
  @media (prefers-color-scheme: dark) { :root { --background: #0a0a0a; --foreground: #ededed; } }
  @theme inline {
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --font-sans: var(--font-geist-sans);
    --font-mono: var(--font-geist-mono);
  }
  ```
- **Geist / Geist Mono** already loaded via `next/font` and available as `--font-geist-mono`
- Dark mode currently via `prefers-color-scheme` media query — no class-based toggle yet
- No `tailwind.config.ts` — v4 CSS-first approach
- **No component libraries installed** — clean slate for Radix UI

### What needs to change
- `app/page.tsx` is boilerplate — full replacement
- `globals.css` needs new color token palette replacing the current bg/fg pair
- Dark mode needs to switch to class-based toggle (for manual theme switching)

---

## 2. Crush Design Patterns

**Source:** `charmbracelet/crush` source + `charmtone` package — confidence **High**

### Color palette (exact hex from charmtone source)

| Role | Name | Hex |
|---|---|---|
| Background base | Pepper | `#201F26` |
| Background lighter | BBQ | `#2D2C35` |
| Background subtle | Charcoal | `#3A3943` |
| Background overlay | Iron | `#4D4C57` |
| Foreground base | Ash | `#DFDBDD` |
| Foreground muted | Squid | `#858392` |
| Foreground dim | Smoke | `#BFBCC8` |
| Foreground subtle | Oyster | `#605F6B` |
| Primary accent | Charple | `#6B50FF` |
| Secondary accent | Dolly | `#FF60FF` |
| Tertiary accent | Bok | `#68FFD6` |
| Border unfocused | Charcoal | `#3A3943` |
| Border focused | Charple | `#6B50FF` |
| Error | Sriracha | `#EB4268` |
| Info | Malibu | `#00A4FF` |
| Success | Guac | `#12C78F` |

Aesthetic: warm dark purple-gray base + purple-to-fuchsia accent gradient. Not cold blue-black.

### Layout structure
```
┌─────────────────────────────────────────────────┐
│         HEADER (title / model name)             │
├─────────────────────────────────────────────────┤
│                                                 │
│         CHAT MESSAGE LIST (scrollable)          │
│                                                 │
├─────────────────────────────────────────────────┤
│         INPUT AREA (textarea, ~5 rows)          │
├─────────────────────────────────────────────────┤
│         STATUS BAR (hints / metadata)           │
└─────────────────────────────────────────────────┘
```
Note: Crush has a sidebar — skip for now, not needed for a chat-only UI.

### Message differentiation — **no chat bubbles**
Everything left-aligned in a linear feed. Distinction is via left border:
- **User:** `border-l-4 border-[#6B50FF]` (Charple, thick)
- **Assistant:** `border-l-2 border-[#3A3943]` (Charcoal, thin), thickens to Charple on focus/hover
- No avatar icons, no right-side alignment, no speech bubble rounding

### Typography
- Monospace throughout — use `--font-geist-mono` already loaded
- Terminal decoration: box-drawing chars (`│`, `─`, `╱`), block elements (`▌`, `█`) in CSS pseudo-elements
- Logo/title: CSS gradient text `from-[#6B50FF] to-[#FF60FF]`

### Typing indicator
- Block cursor `█` or animated `⋯` in Dolly (`#FF60FF`) while streaming

---

## 3. Radix UI Primitives

**Confidence: High**

Install individually (do not install `radix-ui` monorepo package — adds unnecessary bulk):
```bash
pnpm add @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-tooltip
```

| Primitive | Use |
|---|---|
| `ScrollArea` | Message list — custom-styled scrollbar, native scroll behavior |
| `Separator` | Divider between header and messages, messages and input |
| `Tooltip` | Timestamps, copy-to-clipboard actions |

**ScrollArea anatomy:**
```tsx
<ScrollArea.Root>
  <ScrollArea.Viewport>{/* message list */}</ScrollArea.Viewport>
  <ScrollArea.Scrollbar orientation="vertical">
    <ScrollArea.Thumb />
  </ScrollArea.Scrollbar>
  <ScrollArea.Corner />
</ScrollArea.Root>
```

Scrollbar thumb + track are fully styleable with Tailwind. Target: thin `2px` thumb in `#6B50FF` (Charple), track in `#3A3943`.

---

## 4. Tailwind v4 Dark/Light Theming

**Confidence: High**

### Class-based dark mode (required for manual toggle)
In `globals.css`, replace `prefers-color-scheme` with `@custom-variant`:
```css
@custom-variant dark (&:where(.dark, .dark *));
```
Then add/remove `.dark` class on `<html>` from a client component.

### Token pattern
Define semantic tokens in `@theme` — Tailwind generates utility classes AND CSS vars simultaneously:
```css
@theme {
  --color-bg:        #201F26;
  --color-bg-light:  #2D2C35;
  --color-accent:    #6B50FF;
  /* etc. */
}
```
This gives `bg-bg`, `bg-bg-light`, `text-accent` as utility classes.

For light mode overrides, redefine the same CSS vars in a `.light` or `:root:not(.dark)` selector. Since dark is the default, no initial class needed on `<html>`.

### Theme toggle pattern
```ts
// Persist in localStorage; apply on <html>
const toggle = () => {
  const isDark = document.documentElement.classList.toggle("dark")
  localStorage.setItem("theme", isDark ? "dark" : "light")
}
```
Initialize before hydration to prevent flash (put in `layout.tsx` as a `<script>` tag).

---

## 5. Vercel AI SDK `useChat` — Critical Version Warning

**Confidence: Medium — version uncertainty**

### ⚠️ Breaking API change between v3/v4 and v5+
The `ai` package is not yet installed. As of February 2026, the latest `ai` package is **v5+**, which **completely removed** `input`, `handleInputChange`, `handleSubmit`, and `isLoading` from `useChat`. These are now managed with `useState` yourself.

**v5+ API (current npm default):**
```tsx
import { useChat } from "@ai-sdk/react"
const { messages, sendMessage, status, stop, error } = useChat({ transport: ... })
// status: 'ready' | 'submitted' | 'streaming' | 'error'
// messages[n].parts[n].text  (not messages[n].content)
```

**v3/v4 API (what the PLAN.md was written against):**
```tsx
import { useChat } from "ai/react"
const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat()
// messages[n].content  (string, not parts array)
```

### LangChainAdapter compatibility risk
`LangChainAdapter.toDataStreamResponse()` is used in the planned API route. The oracle-logic step has not been built yet — when building `app/api/chat/route.ts`, verify that LangChainAdapter is compatible with AI SDK v5's response format. If not, pin to `ai@3`.

**Recommended action:** Defer the `ai` package install decision to when `oracle-logic.ts` is being built. Install after confirming LangChainAdapter version support.

### Typing indicator (works in either version)
```tsx
// v5+: use status
const isThinking = status === "submitted"
const isStreaming = status === "streaming"

// Show: animated ⋯ or blinking █ in Dolly (#FF60FF)
{(isThinking || isStreaming) && (
  <span className="animate-pulse font-mono text-[#FF60FF]">█</span>
)}
```

---

## 6. Open Questions

1. **AI SDK version:** Pin to `ai@3` (compatible with existing PLAN.md patterns) or adopt v5+ API? Decide before building `oracle-logic.ts`.
2. **Light theme palette:** Crush is dark-only. Need to define a light theme color set — invert the neutrals (light warm off-white bg, dark text) while keeping Charple/Dolly accents.
3. **Geist Mono vs JetBrains Mono:** Geist Mono is already loaded — sufficient for the terminal aesthetic. No need to add another font.
4. **Sidebar:** Skip for the initial build — not needed for a simple Q&A chatbot.

---

## 7. Recommended Implementation Approach

### Component structure
```
app/
  page.tsx              ← 'use client'; useChat hook, layout shell
  globals.css           ← updated with Crush tokens + @custom-variant dark
components/
  MessageList.tsx       ← ScrollArea.Root wrapping message items
  Message.tsx           ← UserMessage / AssistantMessage variants
  ChatInput.tsx         ← textarea + submit button
  ThemeToggle.tsx       ← dark/light switcher
```

### CSS globals.css changes
1. Replace `prefers-color-scheme` with `@custom-variant dark`
2. Add Crush color tokens to `@theme`
3. Set `font-mono` to use `var(--font-geist-mono)` (already available)

### Message rendering
- No chat bubbles — left-border only
- User: `border-l-4 border-accent pl-3`
- Assistant: `border-l-2 border-bg-subtle pl-3`
- Streaming cursor: `█` in Dolly color, `animate-pulse`

### Install list
```bash
pnpm add @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-tooltip
# ai package: defer until oracle-logic.ts step
```
