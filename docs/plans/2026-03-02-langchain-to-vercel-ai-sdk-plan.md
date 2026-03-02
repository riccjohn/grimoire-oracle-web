# LangChain → Vercel AI SDK Migration — Implementation Plan

## Goal

Replace all LangChain dependencies with the Vercel AI SDK and plain Node.js primitives.
This exposes the full RAG pipeline explicitly (load → split → embed → store → retrieve → generate),
making each step visible and educational rather than hidden inside chain abstractions.

## Acceptance Criteria

- [ ] `pnpm ingest` succeeds with zero LangChain imports
- [ ] `pnpm dev` chat works end-to-end (query → retrieved context → streamed answer)
- [ ] No `@langchain/*`, `langchain`, or `@ai-sdk/langchain` packages remain in `package.json`
- [ ] Supabase `documents` table is re-populated and retrieval quality is at least as good as before
- [ ] Chunk count is higher than before (small sections no longer merged — custom splitter benefit)

---

## Files to Modify

| File                    | Change                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `scripts/ingest.ts`     | Full rewrite — Node fs + custom splitter + AI SDK embedMany + direct Supabase insert |
| `lib/oracle-logic.ts`   | Full rewrite — AI SDK embed + Supabase RPC + return context string                   |
| `app/api/chat/route.ts` | Rewrite — call oracle retrieve + streamText directly                                 |
| `package.json`          | Add `@ai-sdk/anthropic`, `@ai-sdk/cohere`; remove all LangChain packages             |

---

## Implementation Phases

### Phase 1 — Add new packages

**Goal:** Install Vercel AI SDK provider packages before touching any source files.

**Tasks:**

- Run `pnpm add @ai-sdk/anthropic @ai-sdk/cohere`
- Verify both appear in `package.json` dependencies

**Verification:**

- `pnpm add` exits 0
- `node_modules/@ai-sdk/anthropic` and `node_modules/@ai-sdk/cohere` exist

#### Agent Context

```
Files to modify: package.json (via pnpm add, not direct edit)
Command: pnpm add @ai-sdk/anthropic @ai-sdk/cohere
Gate: both packages present in package.json dependencies
Constraints: do not remove any packages yet; source files unchanged in this phase
```

---

### Phase 2 — Rewrite `scripts/ingest.ts`

**Goal:** Replace LangChain file loading, text splitting, embedding, and vector store insertion
with plain Node.js + the custom `splitOnHeaders` function + `embedMany` from the AI SDK +
direct Supabase row insertion.

**Tasks:**

1. Replace `DirectoryLoader` / `TextLoader` with `fs.readdirSync` + `fs.readFileSync` — walk
   `./vault/` recursively, collect all `.md` file paths and their text content
2. Replace `MarkdownTextSplitter` with `splitOnHeaders` (per `custom-splitter-plan.md`):
   - Splits on `\n# `, `\n## `, `\n### ` boundaries unconditionally
   - Any section exceeding `CHUNK_SIZE` (1000 chars) gets further split with a plain character slice
   - Remove `CHUNK_OVERLAP` (not applicable to header splitting)
3. Keep `enrichChunksWithMetadata` unchanged — it's pure TS with no LangChain dependency
4. Replace `CohereEmbeddings` + `SupabaseVectorStore.fromDocuments` with:
   - `embedMany` from `ai` using `@ai-sdk/cohere`'s `cohere.textEmbeddingModel('embed-english-v3.0')`
   - Direct `supabaseClient.from('documents').insert(rows)` where each row is
     `{ content: chunk.pageContent, metadata: chunk.metadata, embedding: vector }`
5. Remove `CHUNK_OVERLAP` constant

**Verification:**

- `pnpm ingest` runs without error
- Console logs a section count higher than the previous run (small sections no longer merged)
- Rows appear in Supabase `documents` table
- No LangChain imports remain in the file

#### Agent Context

```
Files to modify: scripts/ingest.ts
Imports to add: fs (node:fs), path (node:path), embedMany + EmbedManyResult from "ai",
                cohere from "@ai-sdk/cohere", supabaseClient from "./supabase-admin",
                constants from "@/lib/constants"
Imports to remove: all @langchain/* imports
Key schema: documents table columns are (content text, metadata jsonb, embedding vector(1024))
Cohere model ID: "embed-english-v3.0" (1024-dim, matches vector column)
embedMany input type: string[] (the chunk pageContent strings)
embedMany output: { embeddings: number[][] }
Batch note: Cohere free tier is ~96 texts/call; check if embedMany batches automatically,
            otherwise batch manually (slice array into chunks of 96)
Test command: pnpm ingest
Gate (RED): pnpm ingest fails or zero rows inserted
Gate (GREEN): pnpm ingest exits 0, section count logged, rows visible in Supabase
Constraints:
  - Do NOT modify supabase-admin.ts or supabase/schema.sql
  - Do NOT modify enrichChunksWithMetadata — keep it exactly as-is
  - CHUNK_SIZE stays 1000; remove CHUNK_OVERLAP
  - The clear-before-insert pattern (.delete().neq("id", 0)) must be preserved
```

---

### Phase 3 — Rewrite `lib/oracle-logic.ts` and `app/api/chat/route.ts`

**Goal:** Replace the LangChain retrieval chain with an explicit three-step flow:
embed query → call `match_documents` RPC → stream answer via `streamText`.

**Tasks:**

**`lib/oracle-logic.ts`:**

1. Replace `CohereEmbeddings`, `SupabaseVectorStore`, `createStuffDocumentsChain`,
   `createRetrievalChain`, `ChatAnthropic`, `ChatPromptTemplate` imports with
   `embed` from `ai`, `cohere` from `@ai-sdk/cohere`, `supabaseClient` from `@/lib/supabase-client`
2. Export a single `retrieveContext(query: string): Promise<string>` function that:
   - Calls `embed` to get a vector for `query`
   - Calls `supabaseClient.rpc('match_documents', { query_embedding: vector, match_count: RETRIEVAL_K })`
   - Maps the returned rows to their `content` strings and joins with `\n\n`
   - Returns the joined context string
3. Lower `RETRIEVAL_K` from 10 back to 5
4. Keep the `DEBUG` logging (log retrieved doc previews)

**`app/api/chat/route.ts`:**

1. Remove `@ai-sdk/langchain` import (`toUIMessageStream`)
2. Remove `createOracleChain` import
3. Import `retrieveContext` from `@/lib/oracle-logic`
4. Import `streamText` from `ai`, `anthropic` from `@ai-sdk/anthropic`
5. Replace the chain invocation with:
   - Call `retrieveContext(input)` to get context string
   - Call `streamText` with the Anthropic model, a system prompt containing context,
     and the full `messages` array
   - Return `result.toDataStreamResponse()`
6. The system prompt is the same as `createAnswerPrompt` — move it inline here or
   export it from `oracle-logic.ts`

**Verification:**

- `pnpm dev` starts without TypeScript errors
- Sending a chat message returns a streamed response
- The response is grounded in retrieved context (not hallucinated rules)
- No `@langchain/*` or `@ai-sdk/langchain` imports remain in either file

#### Agent Context

```
Files to modify: lib/oracle-logic.ts, app/api/chat/route.ts
match_documents RPC signature:
  query_embedding: number[]   (1024-dim vector)
  match_count: int
  filter: jsonb (default '{}', can omit)
RPC returns: { id, content, metadata, similarity }[]
Anthropic model constant: CHATBOT_MODEL from "@/lib/constants" (currently "claude-haiku-4-5")
Cohere model ID: EMBEDDING_MODEL from "@/lib/constants" (currently "embed-english-v3.0")
RETRIEVAL_K: lower from 10 to 5
streamText return: use result.toDataStreamResponse() for the route Response
System prompt (preserve exactly):
  "You are the Grimoire Oracle, a wizard knowledgeable in TTRPG rules like Old School Essentials
   (BX D&D). Answer questions using ONLY the context provided below. IMPORTANT: If the context
   does not contain the answer, say 'The Oracle did not return any results for that rule.'
   Do NOT make up or invent any rules, numbers, or game mechanics. Context: {context}"
Test command: pnpm dev (manual test via UI)
Gate (GREEN): chat message returns streaming text grounded in retrieved context
Constraints:
  - supabase-client.ts is unchanged
  - constants.ts is unchanged
  - Do not add chat history / multi-turn context to the retrieval call — embed only the latest message
```

---

### Phase 4 — Remove LangChain packages

**Goal:** Clean `package.json` of all LangChain and bridge packages.

**Tasks:**

- Run: `pnpm remove @ai-sdk/langchain @langchain/anthropic @langchain/classic @langchain/cohere @langchain/community @langchain/core langchain`
- Run `pnpm build` to confirm no remaining imports break the build

**Verification:**

- None of the removed package names appear in `package.json`
- `pnpm build` exits 0

#### Agent Context

```
Command: pnpm remove @ai-sdk/langchain @langchain/anthropic @langchain/classic @langchain/cohere @langchain/community @langchain/core langchain
Followed by: pnpm build
Gate (GREEN): pnpm build exits 0 with no TypeScript or module-not-found errors
Constraints: do not remove @ai-sdk/react, ai, @supabase/supabase-js, or any non-LangChain package
```

---

## Constraints & Considerations

- **`supabase/schema.sql` is unchanged** — the `documents` table and `match_documents` RPC are not affected by this migration
- **Cohere batching** — `embedMany` may not auto-batch. If Cohere returns a 429 or batch-size error during ingest, split chunk arrays into groups of 96 and call `embedMany` per group
- **`@ai-sdk/cohere` embedding model ID** — verify the exact string accepted by the provider at implementation time; it should be `'embed-english-v3.0'` but confirm against the SDK docs
- **`toDataStreamResponse()` vs `toUIMessageStreamResponse()`** — confirm the correct method name for the installed `ai` version at implementation time
- **Tests added** — Vitest installed with globals; `scripts/ingest.test.ts` covers `loadVaultFiles` with full ZOMBIES coverage; CI workflow runs on push/PR

## Out of Scope

- Hybrid search (BM25 + vector) — deferred; still using pure vector search
- Chat history in retrieval — not implemented, out of scope for this migration
- Local Supabase environment — deferred to slice 2

---

## Inline Task Graph (beads unavailable)

### P1: Add packages [no-test] [no blockers]

Run `pnpm add @ai-sdk/anthropic @ai-sdk/cohere`. Verify both in package.json.

### P2: Rewrite ingest.ts [in-progress] [blocked-by: P1]

Full rewrite per Phase 2 Agent Context above.
Run `pnpm ingest` to verify. Section count should be higher.

**Progress:**
- [x] `loadVaultFiles` — Node fs recursive walk replacing `DirectoryLoader`/`TextLoader`; fully tested
- [ ] `splitOnHeaders` — custom header splitter replacing `MarkdownTextSplitter`; TDD in progress
- [ ] `enrichChunksWithMetadata` — restore from original (no LangChain deps, keep as-is)
- [ ] `createVectorIndex` — `embedMany` + direct Supabase insert replacing `SupabaseVectorStore`

### P3: Rewrite oracle-logic.ts + route.ts [no-test] [blocked-by: P2]

Full rewrite per Phase 3 Agent Context above.
Run `pnpm dev`, test a query manually.

### P4: Remove LangChain packages [no-test] [blocked-by: P3]

Run `pnpm remove` per Phase 4 Agent Context. Then `pnpm build`.

---

## Approval Checklist

- [ ] Phases are in the right order (packages added before code uses them; LangChain removed last)
- [ ] `enrichChunksWithMetadata` and `extractTitleFromPath` are explicitly preserved
- [ ] `custom-splitter-plan.md` `splitOnHeaders` logic is incorporated in Phase 2
- [ ] `RETRIEVAL_K` lowered to 5 in Phase 3
- [ ] Supabase schema and RPC are untouched

## Next Steps

Working through phases manually with TDD. PR #8 open: `feature/langchain-to-vercel-ai-sdk`.
Next: TDD `splitOnHeaders`, then restore `enrichChunksWithMetadata`, then implement `createVectorIndex`.
