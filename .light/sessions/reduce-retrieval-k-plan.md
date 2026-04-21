# Plan: Reduce RETRIEVAL_K (10 → 5)

**tracker: native**  
**Date:** 2026-04-21  
**Artifact:** `.light/sessions/reduce-retrieval-k-research.md`

---

## Context

`RETRIEVAL_K = 10` in `lib/constants.ts` passes `match_count: 10` to the Supabase `match_documents` RPC, pulling ~10k chars of context per query. The goal is to reduce to 5 to cut token usage and LLM latency.

**Key constraint:** The eval system (`scripts/eval-retrieval.ts`) is a CI-blocking recall@K gate (≥80% required) that was designed at K=10. It only records binary pass/fail — no rank positions are stored. Some fixture chunks may rank at positions 6–10; reducing K to 5 would silently drop those without explanation.

**Why this plan exists:** Add rank position logging to the eval *first*, run a K=10 baseline to record where each of the 12 fixture chunks lands, then reduce K to 5 and compare. This turns a blind experiment into a measured one.

---

## Goal

1. Instrument `scripts/eval-retrieval.ts` to log rank position per fixture (not just pass/fail)
2. Capture a K=10 baseline: know exactly which chunks rank 1–5 vs 6–10
3. Reduce `RETRIEVAL_K` to 5 and verify impact with `pnpm eval`

---

## Acceptance Criteria

- [ ] `pnpm eval` output includes rank position for each fixture (e.g., `PASS [rank 3]` or `FAIL [not found]`)
- [ ] A new `findRank` helper function is covered by unit tests
- [ ] `RETRIEVAL_K` is 5 in `lib/constants.ts`
- [ ] Mock in `lib/retrieval.test.ts` is updated to `RETRIEVAL_K: 5`
- [ ] `pnpm test` passes
- [ ] `pnpm eval` passes (recall ≥ 0.80 at K=5) — or a decision is made to revert based on rank data

---

## Files to Modify

| File | Change |
|---|---|
| `scripts/eval-retrieval.ts` | Add `findRank()` export; update runner to log rank per fixture |
| `scripts/eval-retrieval.test.ts` | Add tests for `findRank` |
| `lib/constants.ts` | `RETRIEVAL_K = 10` → `5` |
| `lib/retrieval.test.ts` | Mock value `RETRIEVAL_K: 10` → `5` |

---

## Implementation Phases

### Phase 1 — Add rank logging to eval (TDD)

**Goal:** Instrument the eval script so each fixture's output shows which rank position the target chunk was found at.

**What to add:**

Export a new `findRank` function from `scripts/eval-retrieval.ts`:
```
findRank(chunks: DocumentMatch[], substring: string): number
```
Returns 1-based rank if found (1 = top result), or -1 if not found in the list.

Update the eval runner to use `findRank` instead of `checkHit` for logging, while keeping the existing `hit` boolean for the recall@K calculation. Output format per fixture:
```
PASS [rank 2] — Magic-User armor rules
PASS [rank 8] — Thief backstab bonus   ← this one is at risk if K→5
FAIL [not found] — ...
```

Note: `checkHit` can be refactored to call `findRank` (returns `findRank(...) !== -1`) or kept independent. Either is fine — just don't regress the existing test coverage.

**Test spec (for `scripts/eval-retrieval.test.ts`):**
- `findRank` returns 1 when the substring matches the first chunk
- `findRank` returns 3 when the substring matches the third chunk
- `findRank` returns -1 when the substring is not found in any chunk
- `findRank` is case-sensitive (matches existing `includes()` behavior)

**Test command:** `pnpm test`

**RED gate:** New `findRank` tests fail (function doesn't exist yet)  
**GREEN gate:** All tests pass including new `findRank` cases

#### Agent Context

```
Files to modify:
  - scripts/eval-retrieval.ts (add findRank export, update runner logging)
  - scripts/eval-retrieval.test.ts (add findRank tests)

Test spec: behavioral (see Phase 1 above)
Test command: pnpm test
RED gate: findRank tests fail — function not yet exported
GREEN gate: pnpm test exits 0, all findRank cases pass
Constraints:
  - scripts/ files may not be imported by app code (CLAUDE.md path rules)
  - Do not change the recall@K calculation logic — only add rank logging to output
  - Keep existing checkHit/computeRecall/isPassing exports intact
```

---

### Phase 2 — Capture K=10 baseline (manual step, no-test)

**This phase cannot be automated** — it requires running `pnpm eval` against live Supabase.

**Step:** After Phase 1 is merged, run:
```bash
pnpm eval
```

Record the rank output for all 12 fixtures. Any fixture showing `[rank 6]` through `[rank 10]` is at risk when K is reduced to 5.

If all 12 fixtures show `[rank 1]` through `[rank 5]`, reducing K to 5 is provably safe.

---

### Phase 3 — Reduce RETRIEVAL_K (no-test)

**Goal:** Change the constant and update the mock. Verify with unit tests and eval.

**Changes:**
- `lib/constants.ts:6` — `RETRIEVAL_K = 10` → `RETRIEVAL_K = 5`
- `lib/retrieval.test.ts:19` — mock `RETRIEVAL_K: 10` → `RETRIEVAL_K: 5`

**Verification:**
1. `pnpm test` — must pass (no assertions depend on K value)
2. `pnpm tsc --noEmit` — must pass
3. `pnpm eval` — must pass (recall ≥ 0.80); if any fixture now shows `FAIL` that was `PASS [rank 6-10]` in the baseline, you have precise data to decide: revert, or adjust fixtures

#### Agent Context

```
Files to modify:
  - lib/constants.ts (line 6: RETRIEVAL_K = 10 → 5)
  - lib/retrieval.test.ts (line 19: mock RETRIEVAL_K: 10 → 5)

Test command: pnpm test && pnpm tsc --noEmit
Gate: both commands exit 0
Constraints:
  - Do NOT change lib/retrieval.ts — it reads the constant at runtime
  - Do NOT change app/api/chat/route.ts
  - Do NOT change eval fixtures — they are the measurement, not the thing being changed
  - pnpm eval requires live Supabase credentials; do not run in agent — user runs manually
```

---

## Constraints & Considerations

- `lib/` files must not import from `scripts/` — `DocumentMatch` type is already exported from `lib/retrieval.ts`, use it in eval imports
- `scripts/eval-retrieval.ts` already imports `retrieveRawChunks` and `DocumentMatch` from `lib/retrieval.ts`
- `pnpm eval` requires live Supabase + Cohere credentials (`.env.local`) — can't be run in CI agents
- The K=10 baseline (Phase 2) must be captured **before** Phase 3 or the comparison is lost

---

## Out of Scope

- Adding a similarity threshold filter (no existing mechanism, separate change)
- Re-ingesting with chunk overlap (separate item in the performance plan)
- Prepending chunk title to context (separate item)
- Trimming conversation history (separate item)
