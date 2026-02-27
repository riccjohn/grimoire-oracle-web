# Grimoire Oracle — Web App Plan

This document captures the architectural decisions and implementation plan for Grimoire Oracle, a TTRPG rule-lookup chatbot built as a Next.js web application with a LangChain RAG pipeline.

---

## Stack

| Layer              | Choice                                 |
| ------------------ | -------------------------------------- |
| Chat LLM           | Google Gemini (`gemini-2.0-flash`)     |
| Embeddings         | Cohere (`embed-english-v3.0`, 1024-dim)  |
| Vector Store       | Supabase pgvector                      |
| Retrieval          | `SupabaseVectorStore` (vector search via `match_documents`) |
| Hybrid Search      | Deferred — add `hybrid_search` RPC if retrieval quality is poor |
| UI                 | Next.js 15 App Router                  |
| Frontend streaming | Vercel AI SDK (`useChat` hook)         |
| API key protection | Next.js API routes (server-side)       |
| Deployment         | GitHub Actions → Vercel (on push to `main`) |
| Ingestion trigger  | GitHub Actions manual workflow              |
| Hosting            | Vercel                                 |

### Stack rationale

**Google Gemini** — The chat model (`gemini-2.0-flash`) uses a Google AI Studio API key, which has a genuinely free tier with no expiry and no credit card required (15 RPM, 1M tokens/day — more than sufficient for a side project). LangChain integration via `@langchain/google-genai`.

**Cohere** — Embeddings use Cohere's `embed-english-v3.0` model (1024-dimensional vectors) via `@langchain/cohere`. The free trial key allows ~1000 API calls/month, each processing up to 96 texts — around 11 calls total for the full vault. This is far more practical than Google's embedding free tier (1000 single calls/day, batch endpoint unsupported). Requires a separate `COHERE_API_KEY`.

**Supabase** — A single PostgreSQL database handles semantic search via pgvector. `SupabaseVectorStore` from `@langchain/community` runs vector similarity queries against the `match_documents` RPC. Full-text hybrid search is deferred — the `hybrid_search` RPC pattern (RRF combining vector + FTS) can be added to the schema if retrieval quality needs improvement.

**Next.js SSR** — API routes run on the server, so `GOOGLE_API_KEY` and Supabase credentials are never sent to the browser.

**Vercel AI SDK (`ai` package)** — Used only on the frontend via the `useChat` React hook. It handles message history state, loading indicators, streaming text rendering, and form wiring — eliminating the manual `useState` + `fetch` + `ReadableStream` boilerplate you'd otherwise write in `app/page.tsx`. On the server side, `LangChainAdapter.toDataStreamResponse()` converts LangChain's output stream into the format `useChat` expects. Critically, the AI SDK's `streamText`/`generateText` functions are **not** used — LangChain stays in charge of the entire RAG pipeline. The AI SDK is purely a transport and UI convenience layer.

**GitHub Actions** — Two workflows in `.github/workflows/`: a `deploy` workflow that fires automatically on push to `main` (via Vercel CLI), and an `ingest.yml` workflow that only runs when manually triggered via `workflow_dispatch`. This keeps deployment automated while preventing ingestion from running on every code change.

---

## Architecture

```
Browser
  │
  │  POST /api/chat   (streaming)
  ▼
Next.js API Route  ←─── server-only, env vars protected here
  │
  ├── ChatGoogleGenerativeAI (gemini-2.0-flash)
  │
  └── SupabaseVectorStore retriever
        │
        └── pgvector (semantic / cosine similarity)
              │
              └── Supabase (documents table)
                    ▲
                    │  populated by:
                    │
              GitHub Actions — ingest-vault (manual trigger)
                    │
              scripts/ingest.ts
                    │
              ├── CohereEmbeddings (embed-english-v3.0)
              └── vault/ markdown files
```

### Retrieval

`SupabaseVectorStore` queries the `match_documents` RPC for vector similarity search. If retrieval quality is poor (e.g. exact OSE terms like spell names aren't surfacing), the upgrade path is to add a `hybrid_search` RPC to the schema that combines vector + full-text search via Reciprocal Rank Fusion (RRF), then pass `queryName: "hybrid_search"` to the vector store.

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
│   ├── oracle-logic.ts       # RAG pipeline (server-only)
│   └── supabase-client.ts    # Supabase client initialization
├── scripts/
│   └── ingest.ts             # Ingestion script → Supabase
├── vault/                    # TTRPG markdown files (or git submodule)
├── .github/workflows/
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
GOOGLE_API_KEY=              # Google AI Studio — chat LLM only (gemini-2.0-flash)
COHERE_API_KEY=              # Cohere — embeddings only (embed-english-v3.0)
SUPABASE_URL=                # Found in Supabase project settings
SUPABASE_ANON_KEY=           # Safe for read queries (RLS enforced)

# Observability — Next.js app (also set in Vercel project settings)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=           # From smith.langchain.com
LANGCHAIN_PROJECT=grimoire-oracle-web

# Ingestion only — never set in Vercel; lives only in GitLab CI variables
SUPABASE_SERVICE_ROLE_KEY=   # Write access — bypasses RLS
```

**Where each variable lives:**

| Variable | `.env.local` | Vercel settings | GitHub Actions |
|---|---|---|---|
| `GOOGLE_API_KEY` | Yes | Yes | No |
| `COHERE_API_KEY` | Yes | No | Yes (ingest) |
| `SUPABASE_URL` | Yes | Yes | No |
| `SUPABASE_ANON_KEY` | Yes | Yes | No |
| `LANGCHAIN_TRACING_V2` | Yes | Yes | No |
| `LANGCHAIN_API_KEY` | Yes | Yes | No |
| `LANGCHAIN_PROJECT` | Yes | Yes | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (local ingest) | **Never** | Yes |
| `VERCEL_TOKEN` | No | No | Yes |

`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security entirely — if it were set in Vercel, a bug in the Next.js app could expose write access to the database. Keep it out of Vercel.

---

## GitHub Actions CI/CD

One workflow in `.github/workflows/ingest.yml` handles manual ingestion. It only runs when triggered via `workflow_dispatch` (Actions tab → "Ingest vault" → "Run workflow") — never automatically.

```yaml
# .github/workflows/ingest.yml
name: Ingest vault

on:
  workflow_dispatch:

jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Run ingestion pipeline
        run: pnpm tsx scripts/ingest.ts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          COHERE_API_KEY: ${{ secrets.COHERE_API_KEY }}
```

### Secrets to configure (Settings → Secrets and variables → Actions)

| Secret | Notes |
|---|---|
| `SUPABASE_URL` | Supabase project REST URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS — keep out of Vercel |
| `COHERE_API_KEY` | Embedding model credentials |

`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security — keep it out of Vercel entirely. The deployed Next.js app uses `SUPABASE_ANON_KEY` (set in Vercel project settings), scoped to read-only queries via RLS.

---

## Implementation Phases

### Phase 1 — Supabase setup

1. Create a new Supabase project
2. Enable the `pgvector` extension: `Database → Extensions → vector`
3. LangChain's `SupabaseVectorStore` will auto-create the `documents` table on first ingest — but you can also create it manually to understand the schema:
   ```sql
   create table documents (
     id bigserial primary key,
     content text,
     metadata jsonb,
     embedding vector(1024),   -- 1024 dims for Cohere embed-english-v3.0
     content_hash text unique
   );
   ```
4. Create the hybrid search SQL function (see [Supabase LangChain docs](https://supabase.com/docs/guides/ai/langchain))

### Phase 2 — Ingestion (`scripts/ingest.ts`)

The ingestion script reads markdown files from `vault/`, chunks and enriches them, embeds each chunk with `CohereEmbeddings`, and writes everything to the Supabase `documents` table via `SupabaseVectorStore.fromDocuments()`.

Key functions to implement:
- `splitDocsIntoChunks` — load and chunk markdown files
- `mergeSmallChunks` — combine fragments below a minimum token threshold
- `enrichChunksWithMetadata` — attach source file, section title, etc.
- `SupabaseVectorStore.fromDocuments()` — embed and store in one call

### Phase 3 — Oracle logic (`lib/oracle-logic.ts`)

The RAG pipeline uses three LangChain primitives composed together:

- `createHistoryAwareRetriever` — rephrases follow-up questions using chat history before running retrieval
- `createStuffDocumentsChain` — stuffs retrieved documents into the prompt context
- `createRetrievalChain` — orchestrates the full pipeline end-to-end

The retriever is `SupabaseVectorStore` calling the `match_documents` RPC for vector similarity search.

Mark the module server-only by keeping it in `lib/` and only importing it from API routes — never from client components.

### Phase 4 — Next.js UI

- `app/api/chat/route.ts` — Streaming POST route. Calls `setupOracle()`, invokes `chain.stream()`, and uses `LangChainAdapter` to return a stream in the format `useChat` expects.
- `app/page.tsx` — Chat interface built with the `useChat` hook. No manual streaming, state management, or fetch wiring needed.

API route skeleton:

```typescript
// app/api/chat/route.ts
import { LangChainAdapter } from 'ai';
import { setupOracle } from '@/lib/oracle-logic';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { Message } from 'ai';

export async function POST(req: Request) {
  const { messages }: { messages: Message[] } = await req.json();

  const chatHistory = messages.slice(0, -1).map((m) =>
    m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
  );
  const input = messages.at(-1)?.content ?? '';

  const chain = await setupOracle();
  const stream = await chain.stream({ input, chat_history: chatHistory });

  // LangChainAdapter bridges LangChain's output stream to the AI SDK data stream format
  return LangChainAdapter.toDataStreamResponse(stream, {
    inputKey: 'answer', // tells the adapter which key in the chunk holds the text
  });
}
```

Frontend skeleton:

```typescript
// app/page.tsx — AI SDK v6 API
'use client';
import { useChat } from '@ai-sdk/react';

export default function Page() {
  // v6 API — old fields (input, handleInputChange, handleSubmit, isLoading) are gone
  const { messages, sendMessage, status } = useChat({ api: '/api/chat' });

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          <strong>{m.role === 'user' ? '❯' : '🧙'}</strong>{' '}
          {m.parts[0].type === 'text' ? m.parts[0].text : ''}
        </div>
      ))}
      {status === 'streaming' && <p>Consulting the grimoire...</p>}
    </div>
  );
}
```

### Phase 5 — GitHub Actions CI/CD

- Add `.github/workflows/ingest.yml` with `workflow_dispatch` trigger
- Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `COHERE_API_KEY` as repository secrets (Settings → Secrets and variables → Actions)
- Manually trigger the workflow from the Actions tab → confirm ingestion runs and rows appear in Supabase

---

## Observability

### LLM tracing with LangSmith

LangSmith is LangChain's observability platform. Enabling it requires zero code changes — just three environment variables. Every chain invocation is automatically traced.

**What it captures for each query:**
- The original user input
- The rephrased search query generated by `createHistoryAwareRetriever`
- The exact documents retrieved by `SupabaseVectorStore` (with scores)
- The full assembled prompt sent to Gemini
- The model response and token counts
- End-to-end latency per step

This is the primary tool for debugging RAG quality issues. Failures in RAG systems fall into two buckets:
1. **Retrieval failure** — the right documents weren't surfaced (fix: tune chunking, embedding model, or hybrid search weights)
2. **Generation failure** — the right documents were retrieved but Gemini synthesized a bad answer (fix: tune the system prompt)

LangSmith lets you distinguish between them by inspecting actual traces — you can see exactly which vault chunks were passed as `{context}` for any given query.

**Free tier:** 100K traces/month — more than enough for a personal project.

**Setup:** Add to `.env.local` and Vercel project settings:
```bash
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=           # From smith.langchain.com
LANGCHAIN_PROJECT=grimoire-oracle-web
```

No code changes required. LangChain picks these up automatically.

### Vercel built-ins (zero setup)

Vercel provides request logs and basic analytics on the free plan with no configuration:
- **Functions tab** — real-time logs for API route invocations, including cold start times
- **Analytics** — page view counts (enable in Vercel dashboard, one click)

---

## Dependencies

```bash
pnpm add next react react-dom
pnpm add ai                          # Vercel AI SDK — useChat hook + LangChainAdapter
pnpm add @langchain/google-genai @langchain/cohere @langchain/community @langchain/core @langchain/textsplitters
pnpm add @supabase/supabase-js
pnpm add -D typescript @types/node @types/react tsx
```

`@langchain/google-genai` covers `ChatGoogleGenerativeAI` for the chat LLM. `@langchain/cohere` provides `CohereEmbeddings` for the embedding pipeline — requires a separate `COHERE_API_KEY`. The Supabase vector store comes via `@langchain/community`. `@ai-sdk/google` is deliberately **not** installed: the AI SDK's provider packages are only needed if you use `streamText`/`generateText`, which you're not — LangChain handles all LLM and embedding calls.

---

## Verification Checklist

- [ ] Run `pnpm tsx scripts/ingest.ts` locally → confirm rows appear in Supabase `documents` table
- [ ] Run `pnpm dev` → open `http://localhost:3000` → ask a rules question → confirm streaming response
- [ ] Open LangSmith → confirm a trace appeared → inspect the retrieved documents and rephrased query
- [ ] Open browser DevTools → Network tab → inspect the `/api/chat` request → confirm no API keys in request headers or response body
- [ ] Push to `main` → confirm Vercel deployment succeeds
- [ ] Trigger the `Ingest vault` workflow manually in GitHub Actions → confirm it completes and rows appear in Supabase `documents` table
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is NOT present in Vercel project environment variables
- [ ] Visit the production Vercel URL → confirm streaming chat works end-to-end
