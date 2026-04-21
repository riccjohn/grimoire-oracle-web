# CLAUDE.md / # AGENTS.md

(Update CLAUDE.md - AGENTS.md is just a symlink)

## Architecture

This is a RAG chatbot that answers TTRPG rules questions using Old School Essentials markdown files stored in `vault/`.

**Data flow:** User message → `app/api/chat/route.ts` (Next.js API route) → `lib/retrieval.ts` (Cohere embedding + Supabase vector search) → Anthropic Claude LLM (via AI SDK) → streamed response.

**Key files:**
- `app/api/chat/route.ts` — streaming chat API route
- `lib/retrieval.ts` — RAG retrieval logic (embedding + vector search)
- `lib/supabase-client.ts` — Supabase client (anon key, browser/server)
- `scripts/ingest.ts` — ingestion pipeline: reads vault MD → chunks → embeds → upserts to Supabase
- `scripts/supabase-admin.ts` — Supabase admin client (service role key, scripts only)
- `components/` — React chat UI components
- `vault/` — source OSE markdown files (read-only reference material)

**Environment flags:**
- `DEBUG=true` — server-side logging of query, retrieved doc count, and chunk previews
- `CHATBOT_ENABLED=false` — disables the LLM entirely (retrieval still runs)

Plans are found in `docs/plans`

## Path-scoped rules

- `lib/` — pure functions; no direct Supabase admin client usage here (use `scripts/supabase-admin.ts` for admin ops)
- `scripts/` — CLI entry points; may use admin client; never imported by app code
- `components/` — React only; no direct API calls (use `useChat` hook from AI SDK)
- `app/api/` — Next.js route handlers; keep thin — delegate logic to `lib/`

## Commands

```bash
pnpm test          # run vitest unit tests
pnpm lint          # run ESLint
pnpm tsc --noEmit  # type check (no output files)
pnpm dev           # start Next.js dev server
pnpm ingest        # run ingestion pipeline (requires .env.local)
```

## Remember

- Write tests FIRST before writing production code
- Check for TS errors before considering a task 'done'
- `pnpm tsc --noEmit` must pass before any PR is merged
