# Grimoire Oracle — Web App Plan

This document captures the architectural decisions and implementation plan for Grimoire Oracle, a TTRPG rule-lookup chatbot built as a Next.js web application with a Vercel AI SDK RAG pipeline.

---

## Stack

| Layer              | Choice                                                          |
| ------------------ | --------------------------------------------------------------- |
| Chat LLM           | Claude (`claude-haiku-4-5`) via `@ai-sdk/anthropic`             |
| Embeddings         | Cohere (`embed-english-v3.0`, 1024-dim) via `@ai-sdk/cohere`   |
| Vector Store       | Supabase pgvector                                               |
| Retrieval          | Direct Supabase RPC (`match_documents`)                         |
| UI                 | Next.js 16 App Router                                           |
| Frontend streaming | Vercel AI SDK (`useChat` hook)                                  |
| Backend streaming  | Vercel AI SDK (`streamText`)                                    |
| API key protection | Next.js API routes (server-side)                                |
| Deployment         | GitHub Actions → Vercel (on push to `main`)                     |
| Ingestion trigger  | GitHub Actions manual workflow                                  |
| Hosting            | Vercel                                                          |

### Stack rationale

**Claude (claude-haiku-4-5)** — Fast and cost-effective chat model via Anthropic's API. Integration via `@ai-sdk/anthropic`, which is the standard Vercel AI SDK provider for Anthropic models.

**Cohere** — Embeddings use Cohere's `embed-english-v3.0` model (1024-dimensional vectors) via `@ai-sdk/cohere`. The free trial key allows ~1000 API calls/month, each processing up to 96 texts — around 11 calls total for the full vault.

**Supabase** — A single PostgreSQL database handles semantic search via pgvector. Queries run directly against the `match_documents` RPC function via the Supabase JS client — no LangChain vector store abstraction needed.

**Vercel AI SDK (`ai` package)** — Used for both frontend and backend. On the frontend, the `useChat` hook handles message state, streaming text rendering, and loading indicators. On the backend, `embed` embeds the query, and `streamText` calls Claude and streams the response. `convertToModelMessages` bridges the `UIMessage` (frontend) and `ModelMessage` (LLM API) formats.

**GitHub Actions** — Two workflows: `ci.yml` runs tests on every push; `ingest.yml` only runs when manually triggered via `workflow_dispatch`.

---

## Architecture

```
Browser
  │
  │  POST /api/chat   (streaming)
  ▼
Next.js API Route  ←─── server-only, env vars protected here
  │
  ├── lib/retrieval.ts
  │     ├── @ai-sdk/cohere — embed query (embed-english-v3.0)
  │     └── Supabase RPC — match_documents → top-K chunks
  │
  └── streamText (claude-haiku-4-5)
        └── retrieved chunks injected via system prompt

              ▲
              │  populated by:
              │
        GitHub Actions — ingest-vault (manual trigger)
              │
        scripts/ingest.ts
              │
        ├── @ai-sdk/cohere — embed chunks (embed-english-v3.0)
        └── vault/ markdown files
```

### Retrieval

`lib/retrieval.ts` embeds the user query with Cohere, then calls the `match_documents` Supabase RPC for cosine similarity search. The top-K chunks are joined into a single string and injected into the system prompt for Claude.

The `match_documents` RPC performs vector similarity search. If retrieval quality needs improvement (e.g. exact OSE terms aren't surfacing), the upgrade path is a `hybrid_search` RPC that combines vector + full-text search via Reciprocal Rank Fusion (RRF).

---

## File Structure

```
grimoire-oracle-web/
├── app/
│   ├── page.tsx              # Chat UI (client component)
│   ├── layout.tsx
│   └── api/
│       └── chat/
│           └── route.ts      # Streaming API route (server-only)
├── lib/
│   ├── retrieval.ts          # Embed query + fetch context from Supabase
│   ├── constants.ts          # Model names, Supabase config, tuning params
│   └── supabase-client.ts    # Supabase client (anon key)
├── scripts/
│   ├── ingest.ts             # Ingestion pipeline → Supabase
│   └── ingest.test.ts        # Vitest unit tests for ingestion pipeline
├── supabase/
│   └── schema.sql            # Table schema + RLS policy + match_documents RPC
├── vault/                    # TTRPG markdown files (git submodule)
├── .github/workflows/
│   ├── ci.yml                # Run tests on every push
│   └── ingest.yml            # Manual ingestion trigger (workflow_dispatch)
├── .env.local                # Local dev env vars (gitignored)
├── .env.example              # Template for required env vars
├── package.json
└── tsconfig.json
```

---

## Environment Variables

```bash
# .env.local (never commit this file)

# Runtime — Next.js app (also set in Vercel project settings)
ANTHROPIC_API_KEY=           # Anthropic — chat LLM (claude-haiku-4-5)
COHERE_API_KEY=              # Cohere — embeddings (embed-english-v3.0)
SUPABASE_URL=                # Found in Supabase project settings
SUPABASE_ANON_KEY=           # Safe for read queries (RLS enforced)

# Ingestion only — never set in Vercel
SUPABASE_SERVICE_ROLE_KEY=   # Write access — bypasses RLS
```

**Where each variable lives:**

| Variable                    | `.env.local`       | Vercel settings | GitHub Actions |
| --------------------------- | ------------------ | --------------- | -------------- |
| `ANTHROPIC_API_KEY`         | Yes                | Yes             | No             |
| `COHERE_API_KEY`            | Yes                | No              | Yes (ingest)   |
| `SUPABASE_URL`              | Yes                | Yes             | No             |
| `SUPABASE_ANON_KEY`         | Yes                | Yes             | No             |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (local ingest) | **Never**       | Yes            |

`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security entirely — keep it out of Vercel. The deployed app uses `SUPABASE_ANON_KEY`, scoped to read-only queries via RLS.

---

## GitHub Actions CI/CD

### `ci.yml` — runs on every push
Runs `pnpm test` (Vitest) to catch regressions in the ingestion pipeline.

### `ingest.yml` — manual only
Only runs when triggered via `workflow_dispatch` (Actions tab → "Ingest vault" → "Run workflow").

```yaml
name: Ingest vault

on:
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Run ingestion pipeline
        run: pnpm ingest
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          COHERE_API_KEY: ${{ secrets.COHERE_API_KEY }}
```

### Secrets to configure (Settings → Secrets and variables → Actions)

| Secret                      | Notes                             |
| --------------------------- | --------------------------------- |
| `SUPABASE_URL`              | Supabase project REST URL         |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS — keep out of Vercel |
| `COHERE_API_KEY`            | Embedding model credentials       |

---

## Implementation Phases

### Phase 1 — Supabase setup ✓

1. Create a new Supabase project
2. Enable the `pgvector` extension: `Database → Extensions → vector`
3. Run `supabase/schema.sql` to create the `documents` table, RLS policy, and `match_documents` RPC:
   ```sql
   create table documents (
     id bigserial primary key,
     content text,
     metadata jsonb,
     embedding vector(1024),   -- 1024 dims for Cohere embed-english-v3.0
     content_hash text unique
   );
   ```

> **RLS note:** RLS must be enabled on the `documents` table with a public read policy, otherwise the anon key returns empty results silently. The policy is defined in `schema.sql` and must come after `create table`.

### Phase 2 — Ingestion pipeline ✓

`scripts/ingest.ts` reads markdown files from `vault/`, chunks and enriches them, embeds each chunk with Cohere, and upserts to the Supabase `documents` table.

Key functions:
- `splitDocsIntoChunks` — load and chunk markdown files using `MarkdownTextSplitter`
- `enrichChunksWithMetadata` — attach source file, section title, etc.
- `embedChunks` — batch-embed with `@ai-sdk/cohere`, progress bar, ~96 texts/call
- `storeChunks` — upsert to Supabase with `content_hash` deduplication

> **Chunking note:** Do not use a `mergeSmallChunks` step — it dilutes embeddings by combining unrelated sections. Small focused chunks (even 1 sentence) produce better retrieval than merged multi-topic chunks.

### Phase 3 — Retrieval (`lib/retrieval.ts`) ✓

Embeds the user query, calls `match_documents`, and returns a joined context string for injection into the system prompt. Tuning constants (`RETRIEVAL_K`, `EMBEDDING_MODEL`) live in `lib/constants.ts`.

### Phase 4 — Next.js chat route ✓

`app/api/chat/route.ts` — validates the request body, extracts the query text from the last message's parts, calls `retrieveContext`, builds a system prompt with the retrieved context, then calls `streamText` and returns `result.toUIMessageStreamResponse()`.

`app/page.tsx` — chat interface built with the `useChat` hook. Sends messages via `sendMessage`, displays streaming responses.

### Phase 5 — GitHub Actions CI/CD ✓

`ci.yml` runs Vitest on every push. `ingest.yml` runs the ingestion pipeline on manual trigger.

---

## Observability

`DEBUG=true` in `.env.local` enables server-side logging of the query, retrieved document count, and the first 120 characters of each retrieved chunk. This is the primary tool for debugging RAG quality locally.

Vercel's Functions tab provides real-time logs for production API route invocations.

---

## Dependencies

```bash
pnpm add next react react-dom
pnpm add ai @ai-sdk/anthropic @ai-sdk/cohere @ai-sdk/react
pnpm add @supabase/supabase-js
pnpm add -D typescript @types/node @types/react tsx vitest
```

---

## Verification Checklist

- [ ] Run `pnpm ingest` locally → confirm rows appear in Supabase `documents` table
- [ ] Run `pnpm dev` → open `http://localhost:3000` → ask a rules question → confirm streaming response
- [ ] Ask an out-of-scope question → confirm "The Oracle did not return any results" response
- [ ] Set `DEBUG=true` → confirm retrieved chunks appear in server logs
- [ ] Open browser DevTools → Network tab → confirm no API keys in request headers or response body
- [ ] Push to `main` → confirm Vercel deployment succeeds
- [ ] Trigger the `Ingest vault` workflow manually in GitHub Actions → confirm it completes
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is NOT present in Vercel project environment variables
- [ ] Visit the production Vercel URL → confirm streaming chat works end-to-end
