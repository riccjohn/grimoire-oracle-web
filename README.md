# Grimoire Oracle Web

A TTRPG rules-lookup chatbot built with Next.js, the Vercel AI SDK, and Supabase pgvector. Ask it questions about Old-School Essentials rules and it retrieves relevant chunks from the rulebook vault and answers using Claude.

Based on my initial proof-of-concept TUI chatbot: [Grimoire Oracle](https://github.com/riccjohn/grimoire-oracle).

<image src='docs/assets/Grimoire_Oracle-Screenshot.png' alt='screenshot of Grimoire Oracle UI' width='400' />

## Stack

| Layer      | Choice                                    |
| ---------- | ----------------------------------------- |
| Chat LLM   | Claude `claude-haiku-4-5` (Anthropic)     |
| Embeddings | Cohere `embed-english-v3.0` (1024-dim)    |
| Vector DB  | Supabase pgvector                         |
| Framework  | Next.js 16 App Router                     |
| AI SDK     | Vercel AI SDK v6                          |

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Supabase

- Create a new Supabase project
- Enable the `pgvector` extension: Database → Extensions → vector
- Run `supabase/schema.sql` in the Supabase SQL editor to create the `documents` table, RLS policy, and `match_documents` RPC function

> **Note:** RLS must be enabled with a public read policy (included in `schema.sql`). Without it, the anon key returns empty results silently.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable                    | Where to get it                          |
| --------------------------- | ---------------------------------------- |
| `ANTHROPIC_API_KEY`         | [console.anthropic.com](https://console.anthropic.com) |
| `COHERE_API_KEY`            | [dashboard.cohere.com](https://dashboard.cohere.com)   |
| `SUPABASE_URL`              | Supabase project settings → API          |
| `SUPABASE_ANON_KEY`         | Supabase project settings → API          |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API (ingest only — never set in Vercel) |

### 4. Ingest the vault

```bash
pnpm ingest
```

This embeds the markdown files in `vault/` and upserts them into Supabase. Uses `content_hash` deduplication so re-running is safe.

### 5. Run locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command        | Description                          |
| -------------- | ------------------------------------ |
| `pnpm dev`     | Start dev server                     |
| `pnpm build`   | Production build                     |
| `pnpm test`    | Run Vitest unit tests                |
| `pnpm ingest`  | Run ingestion pipeline               |
| `pnpm lint`    | ESLint                               |
| `pnpm format`  | Biome formatter                      |

## Disabling the chatbot

Set `CHATBOT_ENABLED=false` in your Vercel environment variables to disable the chatbot. All requests will return a static offline message without calling the LLM or the vector store, preventing token burn when the app is publicly accessible but not actively in use. Remove the variable (or set it to any other value) to re-enable.

## Debugging retrieval

Set `DEBUG=true` in `.env.local` to enable server-side logging of the query, number of retrieved chunks, and a preview of each chunk's content.

## Architecture

See [PLAN.md](./PLAN.md) for full architecture documentation.
