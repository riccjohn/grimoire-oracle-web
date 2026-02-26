# Ingestion Pipeline - Implementation Plan

**Date:** 2026-02-25
**Status:** Complete — Phase 3 done; ingestion working with Cohere
**Branch:** ingestion-pipeline

## Goal

Complete the ingestion pipeline that reads TTRPG markdown files from `vault/`, splits them into chunks, embeds them with Cohere's `embed-english-v3.0`, and writes them to Supabase pgvector — verifiable both locally and via a manual GitHub Actions job.

## Current State

- `vault/` already contains OSE rule markdown files (committed)
- `scripts/ingest.ts` already handles: load → split → merge small chunks
- `@langchain/classic` and `@langchain/core` are already installed
- The embed → upsert step is not yet implemented

## Remaining Work

### Phase 1: Environment Setup [no-test]

**Goal:** Create `.env.local` so the ingest script can authenticate with Google and Supabase.

**Tasks:**
1. Copy `.env.example` to `.env.local` and fill in:
   - `GOOGLE_API_KEY` — for the embedding model
   - `SUPABASE_URL` — your project's REST URL
   - `SUPABASE_SERVICE_ROLE_KEY` — grants write access, bypasses row-level security

**Verification:**
- [x] `.env.local` exists and is gitignored (Next.js `.gitignore` covers this by default)

---

### Phase 2: Supabase Client + Remaining Dependencies [no-test]

**Goal:** Install the packages needed for embedding and vector storage, and create the Supabase client module.

**Why `scripts/supabase-admin.ts`:** LangChain's `SupabaseVectorStore` needs a raw Supabase JS client passed to it — it doesn't create one internally. We create it once in `scripts/supabase-admin.ts` and import it into the ingest script. The service role key is required here (not the anon key) because writing embeddings directly to the `documents` table bypasses row-level security. Kept in `scripts/` (not `lib/`) to prevent accidental import into the Next.js app runtime.

**Tasks:**
1. Install: `pnpm add @langchain/google-genai @langchain/cohere @langchain/community @supabase/supabase-js`
2. Create `scripts/supabase-admin.ts` — export a Supabase client initialised with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, with a runtime guard (throws if either env var is missing)

**Verification:**
- [x] Packages appear in `package.json`
- [x] `pnpm build` passes (no broken imports)

#### Agent Context
- **Files created:** `scripts/supabase-admin.ts`
- **Files to modify:** `package.json`, `pnpm-lock.yaml`
- **Test command:** `pnpm build`
- **Acceptance gate:** TypeScript compiles clean

---

### Phase 3: Complete the Ingestion Script [no-test]

**Goal:** Add the embed → upsert step to `scripts/ingest.ts` so the pipeline writes to Supabase pgvector.

**Tasks:**
1. Import `CohereEmbeddings` from `@langchain/cohere`
2. Import `SupabaseVectorStore` from `@langchain/community/vectorstores/supabase`
3. Import the Supabase client from `scripts/supabase-admin.ts`
4. In `main()`, after `mergeSmallChunks`, call `SupabaseVectorStore.fromDocuments(mergedChunks, embeddings, { client, tableName: "documents" })`
   - `fromDocuments` handles embedding and upsert in one call — do not call the embeddings model separately

**Verification:**
- [x] `pnpm ingest` runs without throwing
- [x] Console shows chunk count at each stage
- [x] Supabase Table Editor shows new rows in `documents` with non-null `embedding` column (1024 dimensions)

#### Agent Context
- **Files to modify:** `scripts/ingest.ts`
- **Test command:** `pnpm ingest`
- **Acceptance gate:** Script exits 0; rows visible in Supabase with 1024-dim embeddings
- **Constraints:**
  - Use `CohereEmbeddings` with `model: "embed-english-v3.0"` — requires `COHERE_API_KEY`
  - `SupabaseVectorStore.fromDocuments()` handles both embedding + upsert — do not call the embeddings model separately
  - The Supabase `documents` table must already exist with `embedding vector(1024)` column before running

---

### Phase 4: GitHub Actions Manual Workflow [no-test]

**Goal:** Add a manually-triggered CI job so ingestion can be run from GitHub without a local environment.

**Tasks:**
1. Create `.github/workflows/ingest.yml` with `workflow_dispatch` trigger only
2. Steps: checkout → setup pnpm → `pnpm install --frozen-lockfile` → `pnpm ingest`
3. Inject `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from repository secrets
4. Add the three secrets in GitHub → Settings → Secrets and variables → Actions
5. Trigger manually from the Actions tab and confirm success

**Verification:**
- [ ] Workflow appears in GitHub Actions tab
- [ ] Manual trigger completes without error
- [ ] New rows appear in Supabase after the run

#### Agent Context
- **Files to create:** `.github/workflows/ingest.yml`
- **Acceptance gate:** Workflow runs green on manual trigger; Supabase rows created
- **Constraints:**
  - `workflow_dispatch` only — must not trigger on push or PR
  - `SUPABASE_SERVICE_ROLE_KEY` must be a repository secret, not hardcoded in the workflow file

---

### Phase 5: Idempotent Upserts [no-test]

**Goal:** Prevent duplicate rows when `pnpm ingest` is run more than once (e.g., locally then on CI).

**Approach:** Add a `content_hash` column to the `documents` table. Before upserting, hash each chunk's content + source path. Use Supabase's upsert (conflict on `content_hash`) instead of insert so re-runs update existing rows rather than appending new ones.

**Tasks:**
1. Add `content_hash text unique` column to the `documents` table in Supabase dashboard
2. In `scripts/ingest.ts`, compute a hash (e.g. SHA-256 via Node's `crypto`) of `chunk.pageContent + chunk.metadata.source` for each chunk
3. Store the hash in `chunk.metadata` so `SupabaseVectorStore` includes it in the row
4. Configure `SupabaseVectorStore.fromDocuments` to upsert on `content_hash` conflict

**Verification:**
- [ ] Run `pnpm ingest` twice — row count in Supabase stays the same after second run
- [ ] Modify a vault file, re-run — updated row reflects new content

#### Agent Context
- **Files to modify:** `scripts/ingest.ts`
- **Schema change:** Add `content_hash text unique` to `documents` table
- **Acceptance gate:** Second run produces no new rows; modified content updates the existing row

---

## Constraints

- **Key separation:** `SUPABASE_SERVICE_ROLE_KEY` (ingest only) vs `SUPABASE_ANON_KEY` (app runtime, slice 2) — never mix
- **No app code yet:** Nothing in `app/` or `lib/oracle-logic.ts` is part of this slice
- **Idempotency:** Re-running `pnpm ingest` will insert duplicate rows until Phase 5 is complete
- **Supabase table:** The `documents` table with `embedding vector(1024)` must be created in the Supabase dashboard before Phase 3 can run

## Out of Scope

- Retrieval, RAG pipeline, chat API (`lib/oracle-logic.ts`, `app/api/chat/route.ts`)
- Frontend UI (`app/page.tsx`)
- Vercel deployment
- Hybrid search (`kw_match_documents` SQL function) — slice 2
- LangSmith tracing
