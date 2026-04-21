# Chatbot Performance & Quality Improvements

Improvements identified from reviewing `lib/retrieval.ts`, `app/api/chat/route.ts`, `lib/constants.ts`, and `scripts/ingest.ts`.

---

## 1. Prepend chunk title into context

**Files:** `lib/retrieval.ts`
**Impact:** Answer quality — gives the LLM structural cues about what section each chunk came from

`enrichChunksWithMetadata` in `scripts/ingest.ts` stores a `title` in `row.metadata`, but `retrieveContext` discards it — it only joins `row.content`.

**Change:** In `retrieveContext`, change the join from `row.content` to `` `[${row.metadata?.title}]\n${row.content}` ``.

---

## 2. Reduce RETRIEVAL_K

**Files:** `lib/constants.ts`
**Impact:** Speed + token usage — fewer chunks = less noise, faster LLM calls, lower cost

`RETRIEVAL_K = 10` means ~10k chars of context per query. Most rules questions need far less.

**Change:** Reduce `RETRIEVAL_K` from `10` to `5`. One-line change. Tune further based on observed quality.

---

## 3. Trim conversation history sent to LLM

**Files:** `app/api/chat/route.ts`
**Impact:** Token usage — conversation history grows unboundedly; prior turns rarely add signal for a rules Q&A bot

Currently passes the full `messages` array via `convertToModelMessages(messages)`.

**Change:** Pass only the last message (or last 2 turns) instead of full history. E.g., `messages.slice(-2)` before `convertToModelMessages`.

---

## 4. Add chunk overlap on ingest

**Files:** `scripts/ingest.ts`
**Impact:** Answer quality — rules that span a hard character boundary are currently split in half; neither half retrieves reliably

`splitLargeChunks` slices on hard character boundaries with no overlap.

**Change:** Introduce a `CHUNK_OVERLAP` constant (e.g., 150 chars). When building slices, start each slice `CHUNK_OVERLAP` chars before the previous slice ended. Requires a re-ingest after the change.

---

## Order of attack (suggested)

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 2 | Reduce RETRIEVAL_K | Trivial | Medium |
| 1 | Prepend chunk title | Small | Medium |
| 3 | Trim conversation history | Small | Medium |
| 4 | Chunk overlap on ingest | Medium (+ re-ingest) | Medium |
