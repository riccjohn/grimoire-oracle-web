# Chatbot Implementation — Learning Plan
**Date:** 2026-02-26
**Goal:** Wire up the RAG chatbot layer yourself, as a learning exercise. This plan gives you hints and checkpoints — not code. Ask Claude if you get stuck on any step.

---

## Architecture

The chatbot has three layers. Build them in order — each depends on the previous.

```
UI (app/page.tsx)
    ↓ calls
API Route (app/api/chat/route.ts)
    ↓ calls
Oracle Logic (lib/oracle-logic.ts)
    ↓ uses
Supabase client (lib/supabase-client.ts)
```

---

## Step 1 — Install the AI SDK

Install two packages: `ai` (Vercel AI SDK) and `@ai-sdk/react` (React hooks).
- `ai` is used in the API route to stream responses
- `@ai-sdk/react` is used in the UI for the `useChat` hook

**Checkpoint:** Both appear in `package.json` dependencies.

---

## Step 2 — Supabase client (`lib/supabase-client.ts`) ✅

Create a **read-only** Supabase client for the app.

**What to look up:** `@supabase/supabase-js` — `createClient(url, key)`

**Which env vars:** `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- Do NOT use `SUPABASE_SERVICE_ROLE_KEY` here — that has write access and must never be used in app routes

**Note:** The file was named `lib/supabase-client.ts` (not `lib/supabase.ts`) and exports `supabaseClient`.

**Checkpoint:** File exists, TypeScript compiles clean.

---

## Step 3 — Oracle logic (`lib/oracle-logic.ts`)

This is the RAG chain. RAG = Retrieval Augmented Generation:
1. A question comes in
2. Relevant document chunks are retrieved from the vector store
3. Those chunks are "stuffed" into the LLM prompt as context
4. The LLM answers based on the retrieved content

### 3a. The retriever

Use `SupabaseVectorStore` from `@langchain/community/vectorstores/supabase`.
- Pass it the Supabase client from `lib/supabase-client.ts`
- Pass it a `CohereEmbeddings` instance from `@langchain/cohere` — model `embed-english-v3.0` (must match what was used during ingestion)
- Set `tableName: "documents"` and `queryName: "match_documents"`
- Call `.asRetriever({ k: 5 })` on it to get a retriever

**Why not `SupabaseHybridSearch`?** That retriever requires a `kw_match_documents` SQL function that isn't in the current schema. Plain vector search is sufficient to start — if retrieval quality is poor, we can add the `hybrid_search` RPC and switch (Path B).

### 3b. The LLM

Use `ChatGoogleGenerativeAI` from `@langchain/google-genai`.
- Model: `gemini-2.0-flash`
- Write a system prompt that establishes the Oracle persona — instruct it to answer OSE rules questions only, and to say it doesn't know if the answer isn't in the retrieved context

### 3c. The chain

Two LangChain functions to learn:
- `createStuffDocumentsChain` — takes the LLM + a prompt template; produces a chain that injects retrieved docs into the prompt
- `createRetrievalChain` — wraps the retriever + stuff chain together into one callable chain

**What to look up:** LangChain docs for `createRetrievalChain` — the example there is nearly identical to what you need.

**Key detail:** The output object has an `answer` key (not `text` or `result`).

**What to export:** A single async function `createOracleChain()` that returns the assembled chain.

**Checkpoint:** `pnpm tsc --noEmit` passes with no errors in this file.

---

## Step 4 — API route (`app/api/chat/route.ts`)

A Next.js App Router Route Handler that streams LLM responses back to the browser.

**Concept:** Instead of waiting for the full response and returning it at once, streaming sends tokens as they're generated — this gives the typewriter effect in the UI.

### What to implement

1. Export an async `POST` function that accepts a `Request`
2. Parse the body — the AI SDK sends `{ messages: [...] }`. Extract the last message's `content` as the user's question
3. Call `createOracleChain()` and run it against the question
4. Return a streaming response using `LangChainAdapter.toDataStreamResponse()` from the `ai` package

**What to look up:** `LangChainAdapter` in the Vercel AI SDK docs.

**Hint — getting the stream:** Call `.stream()` on the chain instead of `.invoke()`. The `createRetrievalChain` output has both `context` (retrieved docs) and `answer` (generated text). Stream only the answer by chaining `.pick("answer")` before `.stream()`.

**Checkpoint:** Send a `POST` request to `http://localhost:3000/api/chat` with body `{ "messages": [{ "role": "user", "content": "What is the AC of leather armour?" }] }` using curl or a REST client. You should see a streamed response.

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"What is the AC of leather armour?"}]}'
```

---

## Step 5 — Connect the UI (`app/page.tsx`)

Replace the stub `useState` with the real `useChat` hook.

### ⚠️ AI SDK v5 API — breaking change from older tutorials

Most tutorials and blog posts are written against v3/v4. The version you installed (v5) has a different API. The old fields `input`, `handleInputChange`, `handleSubmit`, and `isLoading` are gone.

**The v5 API:**
```
const { messages, sendMessage, status } = useChat({ api: '/api/chat' })
```
- `sendMessage(text)` — replaces the old `handleSubmit`
- `status` — `'ready' | 'submitted' | 'streaming' | 'error'`
- `messages[n].parts` — content lives in `parts`, not a `content` string

### What to update

1. Import `useChat` from `@ai-sdk/react`
2. Replace the `useState` stub block with `useChat({ api: '/api/chat' })`
3. Update `handleSend` to call `sendMessage` instead of `setMessages`
4. Update how you pass messages to `MessageList` — v5 messages use `parts[0].text` for text content instead of a `content` string. You'll need to adapt either the prop type or the `Message` component.

**Hint:** The `isStreaming` prop on `MessageList` can use `status === 'streaming'`.

**Checkpoint:** Type a question in the UI and get a real streamed answer back from the Oracle.

---

## Final checklist

- [x] `lib/supabase-client.ts` — anon client exported
- [ ] `lib/oracle-logic.ts` — RAG chain with Gemini + SupabaseVectorStore
- [ ] `app/api/chat/route.ts` — streaming POST route
- [ ] `app/page.tsx` — real `useChat` hook, stub removed
- [ ] `pnpm build` passes
- [ ] Manual test: question gets a relevant OSE answer

---

## Key gotchas to watch for

- **Service role key:** Never use `SUPABASE_SERVICE_ROLE_KEY` in `lib/supabase-client.ts` — anon key only
- **AI SDK v6:** Don't follow tutorials that use `handleSubmit` or `isLoading` — those are the old v3/v4 API. You have v6 installed (`ai@6`, `@ai-sdk/react@3`).
- **LangChainAdapter compatibility:** If streaming doesn't work, check that `LangChainAdapter` is imported from `ai` (not a sub-path)
- **`match_documents` RPC:** `SupabaseVectorStore` requires this function to exist in your Supabase project — it was created when you ran the schema SQL
- **Embeddings model must match ingestion:** `SupabaseVectorStore` embeds the query before searching. Use `CohereEmbeddings` with `embed-english-v3.0` — the same model used during ingestion. A different model produces incompatible vectors and garbage results.
- **inputKey:** If you use `createRetrievalChain`, the chain expects an `input` key by default. Pass your question as `{ input: question }`
- **Path B (future):** If retrieval quality is poor, the fix is to add a `hybrid_search` RPC to the schema (adds full-text search via RRF) and switch to `SupabaseVectorStore` with `queryName: "hybrid_search"`
