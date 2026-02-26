# Grimoire Oracle — Web App Plan

This document captures the architectural decisions and implementation plan for Grimoire Oracle, a TTRPG rule-lookup chatbot built as a Next.js web application with a LangChain RAG pipeline.

---

## Stack

| Layer              | Choice                                 |
| ------------------ | -------------------------------------- |
| Chat LLM           | Google Gemini (`gemini-2.0-flash`)     |
| Embeddings         | Google (`gemini-embedding-001`, 3072-dim) |
| Vector Store       | Supabase pgvector                      |
| Keyword Search     | Supabase full-text search              |
| Hybrid Search      | `SupabaseHybridSearch` (SQL function)  |
| UI                 | Next.js 15 App Router                  |
| Frontend streaming | Vercel AI SDK (`useChat` hook)         |
| API key protection | Next.js API routes (server-side)       |
| Deployment         | GitLab CI → Vercel (on push to `main`) |
| Ingestion trigger  | GitLab CI manual job                   |
| Hosting            | Vercel                                 |

### Stack rationale

**Google Gemini** — Both the chat model (`gemini-2.0-flash`) and embeddings (`gemini-embedding-001`) come from a single Google AI Studio API key, which has a genuinely free tier with no expiry and no credit card required (15 RPM, 1M tokens/day — more than sufficient for a side project). LangChain integration via `@langchain/google-genai`. The embedding model produces 3072-dimensional vectors. If you ever want to switch to a paid provider (e.g. Anthropic), it's a two-line swap in `lib/oracle-logic.ts`.

**Supabase** — A single PostgreSQL database handles both semantic search (pgvector) and keyword search (PostgreSQL full-text search). LangChain's `SupabaseHybridSearch` retriever runs both in a single SQL function call, keeping all retrieval logic inside the database rather than in application code.

**Next.js SSR** — API routes run on the server, so `GOOGLE_API_KEY` and Supabase credentials are never sent to the browser.

**Vercel AI SDK (`ai` package)** — Used only on the frontend via the `useChat` React hook. It handles message history state, loading indicators, streaming text rendering, and form wiring — eliminating the manual `useState` + `fetch` + `ReadableStream` boilerplate you'd otherwise write in `app/page.tsx`. On the server side, `LangChainAdapter.toDataStreamResponse()` converts LangChain's output stream into the format `useChat` expects. Critically, the AI SDK's `streamText`/`generateText` functions are **not** used — LangChain stays in charge of the entire RAG pipeline. The AI SDK is purely a transport and UI convenience layer.

**GitLab CI** — Two jobs in a single `.gitlab-ci.yml`: a `deploy` job that fires automatically on push to `main` (via Vercel CLI), and an `ingest-vault` job that only runs when manually triggered. This keeps deployment automated while preventing ingestion from running on every code change.

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
  └── SupabaseHybridSearch retriever
        │
        ├── pgvector (semantic / cosine similarity)
        └── PostgreSQL FTS (keyword search)
              │
              └── Supabase (documents table)
                    ▲
                    │  populated by:
                    │
              GitLab CI — ingest-vault (manual trigger)
                    │
              scripts/ingest.ts
                    │
              ├── GoogleGenerativeAIEmbeddings (gemini-embedding-001)
              └── vault/ markdown files
```

### Hybrid search

`SupabaseHybridSearch` runs a single PostgreSQL RPC function that performs both vector similarity search and full-text search inside the database, then returns a merged result. All hybrid logic lives in SQL — fewer round trips, no orchestration in TypeScript.

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
│   └── supabase.ts           # Supabase client initialization
├── scripts/
│   └── ingest.ts             # Ingestion script → Supabase
├── vault/                    # TTRPG markdown files (or git submodule)
├── .gitlab-ci.yml            # CI/CD with manual ingest job
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
GOOGLE_API_KEY=              # Google AI Studio — free tier, covers both LLM and embeddings
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

| Variable | `.env.local` | Vercel settings | GitLab CI |
|---|---|---|---|
| `GOOGLE_API_KEY` | Yes | Yes | Yes (ingest) |
| `SUPABASE_URL` | Yes | Yes | No |
| `SUPABASE_ANON_KEY` | Yes | Yes | No |
| `LANGCHAIN_TRACING_V2` | Yes | Yes | No |
| `LANGCHAIN_API_KEY` | Yes | Yes | No |
| `LANGCHAIN_PROJECT` | Yes | Yes | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (local ingest) | **Never** | Yes |
| `VERCEL_TOKEN` | No | No | Yes |

`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security entirely — if it were set in Vercel, a bug in the Next.js app could expose write access to the database. Keep it out of Vercel.

---

## GitLab CI/CD

Two jobs live in a single `.gitlab-ci.yml`. They appear as separate pipeline runs in the GitLab UI because they're triggered by different events: `deploy` fires on every push to `main`; `ingest-vault` only fires when you manually click "Run" in the GitLab Pipelines UI.

```yaml
# .gitlab-ci.yml

stages:
  - deploy
  - ingest

# Pipeline 1: Deploy chatbot to Vercel on every push to main
deploy-chatbot:
  stage: deploy
  image: node:20
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  script:
    - pnpm install --frozen-lockfile
    - pnpm dlx vercel pull --yes --environment=production --token=$VERCEL_TOKEN
    - pnpm dlx vercel build --prod --token=$VERCEL_TOKEN
    - pnpm dlx vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN
  variables:
    VERCEL_ORG_ID: $VERCEL_ORG_ID
    VERCEL_PROJECT_ID: $VERCEL_PROJECT_ID

# Pipeline 2: Rebuild the vector index on demand (never runs automatically)
ingest-vault:
  stage: ingest
  image: node:20
  when: manual
  rules:
    - when: manual
  script:
    - pnpm install --frozen-lockfile
    - pnpm tsx scripts/ingest.ts
  variables:
    SUPABASE_URL: $SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY: $SUPABASE_SERVICE_ROLE_KEY
    GOOGLE_API_KEY: $GOOGLE_API_KEY
```

### CI/CD variables to configure (Settings → CI/CD → Variables)

| Variable | Used by | Mask? | Protect? |
|---|---|---|---|
| `VERCEL_TOKEN` | `deploy-chatbot` | Yes | Yes |
| `VERCEL_ORG_ID` | `deploy-chatbot` | No | No |
| `VERCEL_PROJECT_ID` | `deploy-chatbot` | No | No |
| `SUPABASE_URL` | `ingest-vault` | No | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `ingest-vault` | Yes | Yes |
| `GOOGLE_API_KEY` | both jobs | Yes | Yes |

`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security — keep it out of the `deploy-chatbot` job entirely. The deployed Next.js app uses the `SUPABASE_ANON_KEY` (set in Vercel project settings), which is scoped to read-only queries via RLS.

**Note on Vercel + GitLab:** Vercel has a native GitLab integration that can auto-deploy without a CI job — but using the Vercel CLI in GitLab CI gives you more control over environment selection and deployment timing within your pipeline.

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
     embedding vector(3072)    -- 3072 dims for Google gemini-embedding-001
   );
   ```
4. Create the hybrid search SQL function (see [Supabase LangChain docs](https://supabase.com/docs/guides/ai/langchain))

### Phase 2 — Ingestion (`scripts/ingest.ts`)

The ingestion script reads markdown files from `vault/`, chunks and enriches them, embeds each chunk with `GoogleGenerativeAIEmbeddings`, and writes everything to the Supabase `documents` table via `SupabaseVectorStore.fromDocuments()`.

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

The retriever is `SupabaseHybridSearch`, which runs vector and full-text search in a single SQL call.

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
// app/page.tsx
'use client';
import { useChat } from 'ai/react';

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}>
          <strong>{m.role === 'user' ? '❯' : '🧙'}</strong> {m.content}
        </div>
      ))}
      {isLoading && <p>Consulting the grimoire...</p>}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} placeholder="Ask me about OSE rules..." />
        <button type="submit">Ask</button>
      </form>
    </div>
  );
}
```

### Phase 5 — GitLab CI/CD

- Add `.gitlab-ci.yml` to the repo root with both jobs (`deploy-chatbot` and `ingest-vault`)
- In Vercel: create a project, link it to the GitLab repo, grab the `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`
- Add all CI/CD variables to GitLab (Settings → CI/CD → Variables) per the table in the CI/CD section above
- Add runtime variables to Vercel project settings (`GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, LangSmith vars)
- Push to `main` → confirm `deploy-chatbot` runs automatically
- Manually trigger `ingest-vault` → confirm ingestion runs and rows appear in Supabase

---

## Observability

### LLM tracing with LangSmith

LangSmith is LangChain's observability platform. Enabling it requires zero code changes — just three environment variables. Every chain invocation is automatically traced.

**What it captures for each query:**
- The original user input
- The rephrased search query generated by `createHistoryAwareRetriever`
- The exact documents retrieved by `SupabaseHybridSearch` (with scores)
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
pnpm add @langchain/google-genai @langchain/community @langchain/core @langchain/textsplitters
pnpm add @supabase/supabase-js
pnpm add -D typescript @types/node @types/react tsx
```

`@langchain/google-genai` covers both `ChatGoogleGenerativeAI` and `GoogleGenerativeAIEmbeddings` — one package, one API key, no cost. The Supabase vector store comes via `@langchain/community`. `@ai-sdk/google` is deliberately **not** installed: the AI SDK's provider packages are only needed if you use `streamText`/`generateText`, which you're not — LangChain handles all LLM and embedding calls.

---

## Verification Checklist

- [ ] Run `pnpm tsx scripts/ingest.ts` locally → confirm rows appear in Supabase `documents` table
- [ ] Run `pnpm dev` → open `http://localhost:3000` → ask a rules question → confirm streaming response
- [ ] Open LangSmith → confirm a trace appeared → inspect the retrieved documents and rephrased query
- [ ] Open browser DevTools → Network tab → inspect the `/api/chat` request → confirm no API keys in request headers or response body
- [ ] Push to `main` → confirm `deploy-chatbot` CI job runs automatically and Vercel deployment succeeds
- [ ] Trigger the `ingest-vault` job manually in GitLab UI → confirm it completes and rows appear in Supabase `documents` table
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is NOT present in Vercel project environment variables
- [ ] Visit the production Vercel URL → confirm streaming chat works end-to-end
