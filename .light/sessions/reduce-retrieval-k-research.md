# Research: Reduce RETRIEVAL_K (10 → 5)

**Feature:** Reduce `RETRIEVAL_K` from 10 to 5 in `lib/constants.ts`  
**Goal:** Cut token usage, reduce LLM latency, and lower context noise for a rules Q&A RAG bot  
**Depth:** Quick (single constant, one call site, no external patterns needed)

---

## Codebase Findings

### Definition

**`lib/constants.ts:6`**
```ts
export const RETRIEVAL_K = 10
```

All retrieval-related constants in this file:

| Constant | Value | Purpose |
|---|---|---|
| `RETRIEVAL_K` | `10` | Top-K chunks from vector search |
| `RECALL_K_THRESHOLD` | `0.8` | Eval gate: 80% recall@K must pass |
| `EMBEDDING_MODEL` | `"embed-english-v3.0"` | Cohere model |
| `CHATBOT_MODEL` | `"claude-haiku-4-5"` | LLM |
| `MAX_CHUNK_SIZE` | `1000` (in `scripts/ingest.ts:11`) | Hard char limit per chunk |
| `EMBED_BATCH_SIZE` | `96` (in `scripts/ingest.ts:12`) | Cohere batch size |

No similarity threshold filter — Supabase `match_documents` RPC returns all top-K results regardless of absolute similarity score.

### Historical Context — IMPORTANT

Commit `c4f93bc` (March 2, 2026) **increased** `RETRIEVAL_K` from **5 → 10**. This change was deliberate; a research doc (`docs/plans/2026-03-06-retrieval-eval-recall-k-research.md`) justifies K=10 and RECALL_K_THRESHOLD=0.8 as "standard starting gate for domain-specific corpora," but provides no explicit data showing why 5 was insufficient.

**Implication:** Reducing back to 5 is a partial revert of that deliberate change. The eval was designed and tuned at K=10. The risk that some fixture's target chunk ranks 6–10 is real — we don't know without running the eval.

### Call Sites

**Only one active call site:** `lib/retrieval.ts:28`
```ts
const rows = await supabaseClient.rpc(SUPABASE_MATCH_DOCUMENTS_FUNCTION, {
  query_embedding: embedding,
  match_count: RETRIEVAL_K,   // ← the only place this controls anything
})
```
The K chunks are then joined by `\n\n` in `retrieveContext()` and passed to the LLM as the system prompt context block.

**Other references (non-functional):**
- `lib/retrieval.test.ts:19` — mocked to `10` in `vi.mock()`; no assertions depend on the value
- `scripts/eval-retrieval.ts` — references `RETRIEVAL_K` in comments only

### Test Impact (Unit Tests)

**`lib/retrieval.test.ts`:**  
Mocks `RETRIEVAL_K: 10`. Assertions test error handling and string-join behavior — NOT the count. `pnpm test` won't break. Update the mock value to 5 for semantic accuracy.

**`scripts/eval-retrieval.test.ts`:**  
References `RECALL_K_THRESHOLD` (different constant). Unaffected.

**No integration or e2e tests.** Vitest + jsdom only.

### Eval Gate (CI-blocking)

The eval (`scripts/eval-retrieval.ts`) runs 12 fixtures against live Supabase. It:
1. Calls `retrieveRawChunks(question)` which passes `match_count: RETRIEVAL_K` to Supabase
2. Checks if each `expectedChunkSubstring` appears in **any** of the K returned chunks (binary hit/miss)
3. Fails CI if Recall@K < 0.80 (i.e., fewer than 10 of 12 fixtures hit)

**The eval only passes/fails — it does NOT record rank positions.** There is no stored data showing whether any target chunk ranks at position 6, 7, 8, 9, or 10. The only way to know if reducing K to 5 would fail the eval gate is to **run the eval**.

The 12 fixture queries cover: class armor/weapon rules, equipment costs, spell effects, ability score modifiers, thief skills, stronghold building, and damage rules. All are substring matches against chunk content.

---

## Summary

### What to Change

| File | Line | Change |
|---|---|---|
| `lib/constants.ts` | 6 | `RETRIEVAL_K = 10` → `RETRIEVAL_K = 5` |
| `lib/retrieval.test.ts` | 19 | Mock value `RETRIEVAL_K: 10` → `RETRIEVAL_K: 5` |

### What NOT to Change
- `lib/retrieval.ts` — reads constant at runtime, no change needed
- `app/api/chat/route.ts` — no change needed
- `scripts/ingest.ts` — no change needed

### Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Eval gate failure (CI-blocking) | **Medium** — unknown without running eval | Run `pnpm eval` after change; revert if < 80% recall |
| Answer quality regression | Low-Medium | Monitor empirically; one-line revert |
| Unit test breakage | None | No assertions on K value |
| This reverts a deliberate prior increase | Medium | The prior research doc didn't record _why_ 5 was too low — may have just been a conservative starting point |

### Recommended Approach

1. Make the two-line change (constant + mock)
2. Run `pnpm test` — should be green
3. Run `pnpm eval` — this is the real gate; if it fails, the change needs to be reverted or eval fixtures re-evaluated

---

## Open Questions

1. **Will the eval gate pass at K=5?** Unknown without running it. The eval was designed at K=10 and some fixtures may depend on chunks ranked 6–10.
2. **Why was K raised from 5 to 10 in March?** The research doc (`docs/plans/2026-03-06-retrieval-eval-recall-k-research.md`) should be read before proceeding — it may contain the specific data that drove the increase.
3. Should a similarity threshold be added to ensure the 5 returned chunks are actually relevant? (Out of scope for this change.)
