# Terminal Chat UI — Implementation Plan
**Date:** 2026-02-26
**Research artifact:** `docs/plans/2026-02-26-terminal-chat-ui-research.md`
**Branch:** `feature/terminal-chat-ui`

---

## Goal

Build a terminal-style chat UI for the Grimoire Oracle chatbot, inspired by Charmbracelet Crush — dark warm-purple palette, left-border message differentiation, monospace font, no chat bubbles. Includes dark/light theme toggle. UI is scaffolded with stub data so it renders and looks correct without the chatbot API being implemented yet.

**Out of scope (user builds these):**
- `lib/supabase.ts` — Supabase read-only client
- `lib/oracle-logic.ts` — LangChain RAG chain
- `app/api/chat/route.ts` — streaming POST route

---

## Acceptance Criteria

- [ ] Dark theme loads by default; toggling to light mode persists across refreshes
- [ ] Full-height terminal layout renders (header, message list, input, status bar)
- [ ] User and assistant messages are visually distinct via left border (no chat bubbles)
- [ ] Message list auto-scrolls to newest message
- [ ] Textarea expands up to ~5 rows; submits on Enter (Shift+Enter for newline)
- [ ] Streaming indicator (`█` animated) renders when `status !== 'ready'`
- [ ] All text uses Geist Mono (monospace throughout)
- [ ] No linter errors (`pnpm lint` passes)
- [ ] `pnpm build` passes

---

## Files to Create

```
components/
  MessageList.tsx     — Radix ScrollArea wrapping message items, auto-scroll
  Message.tsx         — UserMessage / AssistantMessage left-border variants
  ChatInput.tsx       — Textarea + send button, Enter-to-submit
  ThemeToggle.tsx     — Dark/light toggle with localStorage persistence
```

## Files to Modify

```
app/globals.css       — Replace color tokens with Crush palette, add @custom-variant dark
app/layout.tsx        — Add anti-flash script for theme init; add .dark default class
app/page.tsx          — Full replacement: layout shell + stub data + component assembly
```

---

## Implementation Phases

### Phase 1: Color Tokens & Theming [no-test]

**Goal:** Replace the boilerplate color system with the Crush palette and switch dark mode from media query to class-based.

**Tasks:**
1. In `globals.css`:
   - Remove `@media (prefers-color-scheme: dark)` block
   - Add `@custom-variant dark (&:where(.dark, .dark *));` at top
   - Replace `@theme inline` block with full Crush token set (see tokens below)
   - Add light theme overrides in `:root:not(.dark)` selector
2. In `app/layout.tsx`:
   - Add `className="dark"` to `<html>` as the default
   - Add an inline `<script>` before `{children}` that reads `localStorage.getItem('theme')` and applies/removes the `.dark` class before hydration (prevents flash)

**Crush color tokens for `@theme`:**
```css
@theme {
  --color-bg:         #201F26;  /* Pepper — base background */
  --color-bg-light:   #2D2C35;  /* BBQ — elevated surfaces */
  --color-bg-subtle:  #3A3943;  /* Charcoal — borders, subtle bg */
  --color-bg-overlay: #4D4C57;  /* Iron — dialogs/overlays */
  --color-fg:         #DFDBDD;  /* Ash — primary text */
  --color-fg-muted:   #858392;  /* Squid — secondary text */
  --color-fg-dim:     #BFBCC8;  /* Smoke — tertiary text */
  --color-fg-subtle:  #605F6B;  /* Oyster — metadata/hints */
  --color-accent:     #6B50FF;  /* Charple — primary accent, user border */
  --color-accent-2:   #FF60FF;  /* Dolly — secondary accent, cursor */
  --color-accent-3:   #68FFD6;  /* Bok — tertiary accent */
  --color-error:      #EB4268;  /* Sriracha */
  --color-info:       #00A4FF;  /* Malibu */
  --color-success:    #12C78F;  /* Guac */
  --font-mono: var(--font-geist-mono);
}
```

**Light theme overrides (in `globals.css` after `@theme`):**
```css
:root:not(.dark) {
  --color-bg:         #F5F3F0;
  --color-bg-light:   #FFFAF1;
  --color-bg-subtle:  #E8E5E0;
  --color-bg-overlay: #D8D4CE;
  --color-fg:         #201F26;
  --color-fg-muted:   #605F6B;
  --color-fg-dim:     #858392;
  --color-fg-subtle:  #3A3943;
  /* accents stay the same */
}
```

**Verification:**
- [ ] `pnpm dev` — page background is `#201F26` (dark purple)
- [ ] `pnpm lint` passes

#### Agent Context
- **Files to modify:** `app/globals.css`, `app/layout.tsx`
- **Test command:** `pnpm lint && pnpm build`
- **GREEN gate:** Build passes; dark background visible at localhost:3000
- **Constraints:** Do not add `tailwind.config.ts` — v4 CSS-first only. Do not remove the Geist font imports from `layout.tsx`.

---

### Phase 2: Install Radix UI [no-test]

**Goal:** Install the three Radix primitives needed for the chat UI.

**Tasks:**
1. `pnpm add @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-tooltip`

**Verification:**
- [ ] All three packages appear in `package.json`
- [ ] `pnpm build` passes

#### Agent Context
- **Files to modify:** `package.json`, `pnpm-lock.yaml`
- **Test command:** `pnpm build`
- **GREEN gate:** Build passes with new packages installed
- **Constraints:** Install individually (NOT the `radix-ui` monorepo bundle)

---

### Phase 3: Build Components [no-test]

**Goal:** Create the four UI components. No `useChat` dependency yet — accept props only.

#### ThemeToggle.tsx
- Client component
- Reads current theme from `document.documentElement.classList`
- Toggles `.dark` on `<html>`, persists to `localStorage`
- Renders a button showing current mode (e.g. `◑ Dark` / `◑ Light`) in `font-mono text-fg-subtle`

#### Message.tsx
- Accepts `role: 'user' | 'assistant'` and `content: string`
- **User:** `border-l-4 border-accent pl-3 py-1 mb-4`
- **Assistant:** `border-l-2 border-bg-subtle pl-3 py-1 mb-4 hover:border-accent transition-colors`
- Role label above content: `> You` / `🧙 Oracle` — small, `text-fg-subtle font-mono text-xs mb-1`
- Content: `text-fg font-mono text-sm whitespace-pre-wrap`
- Streaming variant: append `<span className="animate-pulse text-accent-2">█</span>` when `isStreaming` prop is true

#### MessageList.tsx
- Wraps content in `ScrollArea.Root` / `ScrollArea.Viewport`
- `ScrollArea.Scrollbar` styled: track `bg-bg-subtle`, thumb `bg-accent opacity-50`
- `useEffect` + `useRef` to scroll to bottom whenever messages change
- Renders `Message` for each item; passes `isStreaming` to last assistant message when appropriate

#### ChatInput.tsx
- `<textarea>` styled: `bg-bg-light border border-bg-subtle focus:border-accent font-mono text-sm text-fg resize-none`
- Placeholder: `Ask the oracle...`
- Expands from 1 to 5 rows based on content (use `rows` attr + `min-h`/`max-h`)
- Enter submits, Shift+Enter inserts newline
- Send button: `▶ Send` or icon, disabled while `isDisabled` prop is true, styled `text-accent`
- `onSubmit(value: string)` callback prop
- Caret color: `caret-accent-2` (Dolly `#FF60FF`)

**Verification:**
- [ ] Components render without errors in `pnpm dev` when imported
- [ ] `pnpm lint` passes

#### Agent Context
- **Files to create:** `components/MessageList.tsx`, `components/Message.tsx`, `components/ChatInput.tsx`, `components/ThemeToggle.tsx`
- **Test command:** `pnpm lint && pnpm build`
- **GREEN gate:** All four files compile; no TypeScript errors
- **Constraints:**
  - Do NOT import from `ai` or `@ai-sdk/react` — UI only, no chatbot logic
  - Components are pure presentational/props-driven — no direct API calls
  - `ThemeToggle` must be a client component (`'use client'`)
  - `MessageList` must be a client component (uses `useEffect`/`useRef`)
  - `ChatInput` must be a client component (controlled input)

---

### Phase 4: Assemble Page [no-test]

**Goal:** Replace boilerplate `app/page.tsx` with the full terminal layout, wired to stub data so the UI is immediately visible and interactive.

**Layout structure (full viewport height, no scroll on body):**
```
<main className="flex flex-col h-screen bg-bg font-mono">
  <header>          ← title gradient + ThemeToggle
  <Separator />
  <MessageList />   ← flex-1 overflow-hidden
  <Separator />
  <ChatInput />     ← fixed height
  <footer>          ← status bar hint text
</main>
```

**Header:**
- Title: `GRIMOIRE ORACLE` with gradient text `bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent`
- Subtitle: `OSE rules lookup` in `text-fg-subtle text-xs`
- `ThemeToggle` aligned right

**Stub messages for development:**
```tsx
// Stub — replace with useChat when building the API route
const [messages, setMessages] = useState([
  { id: '1', role: 'assistant', content: 'Greetings, adventurer. Ask me anything about Old-School Essentials rules.' },
])
const [status, setStatus] = useState<'ready' | 'streaming'>('ready')

const handleSend = (text: string) => {
  setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: text }])
  // TODO: replace stub with real useChat sendMessage
}
```

**Status bar:**
- `Enter to send · Shift+Enter for newline · ◑ toggle theme`
- `text-fg-subtle text-xs font-mono px-4 py-1`

**Verification:**
- [ ] `pnpm dev` — page renders with dark terminal background, gradient title, stub message visible
- [ ] Typing in the input and pressing Enter adds a user message to the list
- [ ] Theme toggle switches between dark and light; survives page refresh
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes

#### Agent Context
- **Files to modify:** `app/page.tsx`
- **Test command:** `pnpm lint && pnpm build`
- **GREEN gate:** Build passes; UI visible and interactive at localhost:3000 with stub data
- **Constraints:**
  - `'use client'` at top — page uses state
  - Do NOT import `useChat` or install the `ai` package — stub only
  - Leave a clear `// TODO: replace with useChat` comment at the stub
  - Do NOT create `lib/oracle-logic.ts`, `lib/supabase.ts`, or `app/api/chat/route.ts` — those are for the user to implement

---

## Inline Task Graph (beads unavailable)

### P1: Color tokens & theming [no-test] [no blockers]
Modify `app/globals.css` and `app/layout.tsx` as specified in Phase 1. Apply all Crush color tokens to `@theme`, add `@custom-variant dark`, add light theme overrides, add anti-flash script to layout.

### P2: Install Radix UI [no-test] [blocked-by: P1]
Run `pnpm add @radix-ui/react-scroll-area @radix-ui/react-separator @radix-ui/react-tooltip`. Verify build passes.

### P3: Build components [no-test] [blocked-by: P2]
Create all four components in `components/` as specified in Phase 3. Props-only, no `ai` package imports.

### P4: Assemble page [no-test] [blocked-by: P3]
Replace `app/page.tsx` with full terminal layout + stub data as specified in Phase 4.

---

## Constraints & Considerations

- **No chatbot code:** `lib/`, `app/api/` are entirely out of scope. Any agent executing this plan must not create files in those directories.
- **No `ai` package install:** The `useChat` hook integration is deferred. The UI uses local `useState` stub instead.
- **Tailwind v4 CSS-first:** No `tailwind.config.ts`. All tokens in `globals.css`.
- **Monospace throughout:** Every text element uses `font-mono` (Geist Mono).
- **Linter:** Biome (formatter) + ESLint (linter). Run `pnpm lint` before marking any phase done.

## Out of Scope

- `lib/supabase.ts` — Supabase anon client
- `lib/oracle-logic.ts` — LangChain RAG pipeline
- `app/api/chat/route.ts` — streaming API route
- `ai` / `@ai-sdk/react` package install — deferred until user builds chatbot
- Markdown rendering in assistant messages (deferred to chatbot step)
- Mobile responsive layout (desktop-first for now)
