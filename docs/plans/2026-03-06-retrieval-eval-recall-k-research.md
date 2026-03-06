# Research: Retrieval Eval — Recall@K CI Gate

**Date:** 2026-03-06
**Topic:** Evaluation Driven Development — eval script invoking the retriever directly, checking recall@K, CI-ready

---

## How All the Pieces Fit Together

```
┌─────────────────────────────────────────────────────┐
│                  THE APP (production)               │
│                                                     │
│  User question                                      │
│       │                                             │
│       ▼                                             │
│  lib/retrieval.ts → retrieveContext(query)          │
│       │  1. Embed query via Cohere                  │
│       │  2. Call Supabase match_documents RPC        │
│       │  3. Join top-10 chunks into one string      │
│       ▼                                             │
│  app/api/chat/route.ts                              │
│       │  Stuffs that string into the LLM prompt     │
│       ▼                                             │
│  Claude answers using the retrieved context         │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│              THE EVAL (CI / local check)            │
│                                                     │
│  scripts/eval-fixtures.json                         │
│       │  10–15 hand-written question+substring pairs│
│       │                                             │
│       ▼                                             │
│  scripts/eval-retrieval.ts                          │
│       │  For each fixture:                          │
│       │  1. Call retrieveRawChunks(question)        │
│       │  2. Check: is expectedSubstring in any      │
│       │     of the top-10 chunks?                   │
│       │  3. Record hit or miss                      │
│       │                                             │
│       ▼                                             │
│  recall@K = hits / total                            │
│  if < 0.80 → exit(1) → CI fails                    │
└─────────────────────────────────────────────────────┘
```

The eval deliberately calls into the **same retrieval stack** the app uses — same embedding model, same Supabase client, same RPC function, same K. This means if retrieval quality drops (e.g. you change chunking, switch embedding models, or break RLS), the eval catches it.

---

## Where Does `retrieveRawChunks` Live — and Why?

**Short answer:** It lives in `lib/retrieval.ts`, alongside `retrieveContext`. It is eval-only — the app never calls it.

**Why not put it in the eval script itself?**

The whole point of the eval is to test the _real production retrieval code path_. If you copy the embed+RPC logic into the eval script, you're testing a separate implementation — not the code the app actually runs. A bug or regression in `lib/retrieval.ts` would go undetected.

By exporting `retrieveRawChunks` from `lib/retrieval.ts`, the eval imports and exercises the exact same module the app uses. The only difference is the return type: raw array instead of joined string.

**Why not a separate `lib/retrieval-eval.ts` file?**

It would need to import everything `retrieval.ts` already imports (Cohere client, Supabase client, constants). That's duplication for no gain. The two functions are so closely related they belong in the same file.

**The mental model:** `retrieveRawChunks` is a lower-level building block that `retrieveContext` could be refactored to use internally — `retrieveContext` would call `retrieveRawChunks` then join the results. We're not doing that refactor now (it's not necessary), but it illustrates why they belong together.

---

## Current Retriever Architecture

### Key Files

| File                     | Role                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `lib/retrieval.ts`       | `retrieveContext(query)` — embeds query, calls Supabase RPC, returns joined string                                             |
| `lib/supabase-client.ts` | Anon-key Supabase client (same one the app uses; respects RLS)                                                                 |
| `lib/constants.ts`       | `RETRIEVAL_K=10`, `EMBEDDING_MODEL="embed-english-v3.0"`, `SUPABASE_MATCH_DOCUMENTS_FUNCTION="match_documents"`                |
| `supabase/schema.sql`    | `match_documents(query_embedding vector(1024), match_count int, filter jsonb)` — returns `{id, content, metadata, similarity}` |

### Retriever Signature (current)

```typescript
// lib/retrieval.ts
const retrieveContext = async (query: string): Promise<string>
// Returns top-10 chunks joined by "\n\n" — loses per-chunk identity
```

**Gap for eval:** The eval script needs raw rows (`Array<{content, metadata, similarity}>`), not the joined string. A second lower-level export is needed.

### Chunk Metadata Shape (Supabase rows)

```typescript
{
	id: number;
	content: string; // markdown text, max 1000 chars
	metadata: {
		source: string; // e.g. "vault/2. Classes/7. Thief.md"
		title: string; // e.g. "Thief Class" | "Monsters > Goblin"
	}
	similarity: number; // cosine similarity in [0,1]
}
```

### Chunking Strategy

- Split at markdown headers (h1–h3) then by 1000-char limit
- No similarity threshold — all top-K results returned
- 408 vault files → ~1010 chunks in Supabase

---

## Recall@K — What It Is

```
Recall@K = (chunks from fixture found in top-K results) / (total fixture chunks)
```

- **K = 10** (matches `RETRIEVAL_K`)
- **Threshold = 80%** — standard starting gate for domain-specific corpora
- Binary per-query: either the expected chunk is in top-K or it is not
- No LLM call required — purely retriever + string match

### Why substring match (not chunk ID)

Chunk IDs change on re-ingestion (table is cleared then re-inserted). Using a distinctive substring from the chunk content is stable across re-ingestions.

---

## Fixture Format

JSON array (zero extra dependencies, native Node import, diff-friendly in PRs):

```json
[
	{
		"question": "What is the base armor class for a Magic-User?",
		"expectedChunkSubstring": "Magic-User",
		"source": "vault/2. Classes/6. Magic-User.md",
		"notes": "AC for unarmored casters"
	}
]
```

**Required fields:** `question`, `expectedChunkSubstring`
**Optional fields:** `source` (human reference, not used in eval logic), `notes`

**Fixture scope:** Start with 10–15 questions covering each major rule category (Classes, Combat, Magic, Monsters, Equipment). Each question should have a distinctive substring that only appears in the relevant chunk — avoid generic words.

**Rate limit check:** 15 fixtures × weekly CI = ~60 Cohere embed calls/month — well within 1000/month free tier.

---

## Eval Script Architecture

### Refactor `lib/retrieval.ts`

`retrieveRawChunks` becomes the single function that does the real work. `retrieveContext` is refactored into a thin wrapper that calls it.

**Step 1a — Expand `DocumentMatch` interface** to include all fields Supabase returns:

```typescript
interface DocumentMatch {
	content: string;
	metadata: { source: string; title: string };
	similarity: number;
}
```

**Step 1b — Add `retrieveRawChunks` export** with the embed → RPC logic (moved from `retrieveContext`):

```typescript
export const retrieveRawChunks = async (
	query: string,
): Promise<DocumentMatch[]> => {
	const model = cohere.embeddingModel(EMBEDDING_MODEL);
	const { embedding } = await embed({ model, value: query });

	if (DEBUG) console.log(`[oracle] query: "${query}"`);

	const rows = await supabaseClient.rpc(SUPABASE_MATCH_DOCUMENTS_FUNCTION, {
		query_embedding: embedding,
		match_count: RETRIEVAL_K,
	});

	if (rows.error) {
		throw new Error(`Error fetching relevant rows: ${rows.error.message}`);
	}

	if (DEBUG) {
		console.log(`[oracle] retrieved ${rows.data.length} docs`);
		rows.data.forEach((row: DocumentMatch, i: number) => {
			console.log(`[oracle] doc[${i}]: ${row.content.slice(0, 120)}...`);
		});
	}

	return rows.data as DocumentMatch[];
};
```

**Step 1c — Refactor `retrieveContext`** into a thin wrapper:

```typescript
const retrieveContext = async (query: string): Promise<string> => {
	const chunks = await retrieveRawChunks(query);
	return chunks.map((chunk) => chunk.content).join('\n\n');
};
```

The chatbot still calls `retrieveContext` and gets a string. The eval calls `retrieveRawChunks` directly and gets the array. Both exercise the same underlying code.

### Step 2 — Create `scripts/eval-fixtures.json`

Write 10–15 question/substring pairs. Open the raw vault markdown files to find distinctive substrings — phrases specific enough that they only appear in one chunk.

```json
[
	{
		"question": "What is the base armor class for a Magic-User?",
		"expectedChunkSubstring": "some distinctive phrase from that chunk",
		"source": "vault/2. Classes/6. Magic-User.md",
		"notes": "optional human note"
	}
]
```

Good substrings: stat values, proper nouns, specific rule sentences. Bad substrings: common words like "attack" or "armor" that appear in many chunks.

### Eval script at `scripts/eval-retrieval.ts`

```
Load fixtures from scripts/eval-fixtures.json
For each fixture:
  1. Call retrieveRawChunks(fixture.question) → top-K rows
  2. hit = rows.some(row => row.content.includes(fixture.expectedChunkSubstring))
  3. Record hit/miss and log result
Compute recall@K = hits / total
If recall < 0.80 → print FAIL, process.exit(1)
Else → print PASS, process.exit(0)
```

### pnpm script to add in `package.json`

```json
"eval": "tsx --env-file=.env.local scripts/eval-retrieval.ts"
```

---

## CI Integration

### New step in `.github/workflows/ci.yml`

Add after existing `pnpm test` step:

```yaml
- name: Run retrieval eval
  run: pnpm tsx scripts/eval-retrieval.ts
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
    COHERE_API_KEY: ${{ secrets.COHERE_API_KEY }}
```

**Key:** Use `SUPABASE_ANON_KEY` (not service role) — exercises real RLS path.
The `ci.yml` already has `SUPABASE_URL` and `SUPABASE_ANON_KEY` needs to be added as a GitHub Actions secret (it is only in `.env.example` today; the service role key is already a secret for `ingest.yml`).

### Current CI secrets available

- `SUPABASE_URL` ✓ (used in `ingest.yml`)
- `SUPABASE_SERVICE_ROLE_KEY` ✓ (ingest only — do NOT use for eval)
- `COHERE_API_KEY` ✓ (used in `ingest.yml`)
- `SUPABASE_ANON_KEY` — **needs to be added as a new GitHub Actions secret**

---

## Files to Create / Modify

| Path                         | Action   | Notes                                                                                    |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `lib/retrieval.ts`           | Refactor | Expand `DocumentMatch`, add `retrieveRawChunks()`, make `retrieveContext` a thin wrapper |
| `scripts/eval-fixtures.json` | Create   | 10–15 question/expectedChunkSubstring pairs                                              |
| `scripts/eval-retrieval.ts`  | Create   | Recall@K runner, exits 1 on failure                                                      |
| `package.json`               | Edit     | Add `"eval"` script                                                                      |
| `.github/workflows/ci.yml`   | Edit     | Add eval step with anon key env                                                          |
| `.env.example`               | Edit     | Add note that `SUPABASE_ANON_KEY` is also needed in CI                                   |

---

## Open Questions

1. **Fixture authoring:** Write fixtures manually from known vault content, or generate synthetically using the LLM? Manual is lower risk for a first pass.
2. **Eval in its own CI job vs. step?** A separate job would allow it to be skipped cheaply if unit tests fail, but a step in the same job is simpler. Recommend: same job for now.
3. **Threshold hardcoded or configurable?** Hardcode `0.80` in the script for simplicity; revisit if the team wants to tune it without code changes.

---

## Confidence Summary

| Finding                                     | Confidence |
| ------------------------------------------- | ---------- |
| Recall@K formula and threshold              | High       |
| JSON fixture format with substring match    | High       |
| `process.exit(1)` CI gate pattern           | High       |
| No LLM call needed for retriever eval       | High       |
| Custom TS script (no off-the-shelf library) | High       |
| Use ANON_KEY not service role for eval      | High       |
| Rate limits comfortable within free tier    | High       |
| Fixture count starting point (10–15)        | Medium     |
