// Re-exports the generated Database type with overrides for known type
// mismatches. The generated file (database.types.ts) is produced by
// `pnpm genSupabaseTypes` and should never be hand-edited.
//
// All app code should import from this file (`@/supabase/database`),
// NOT from `@/supabase/database.types` directly.

import type { Database as RawDatabase } from "./database.types"

// Supabase's type generator maps pgvector columns to `string`, but the
// JS client actually accepts (and the AI SDK produces) `number[]`.
// Rather than post-processing the generated file or using `as unknown as
// string` casts at every call site, we override just the affected arg here.
type RawMatchDocuments = RawDatabase["public"]["Functions"]["match_documents"]

export type Database = Omit<RawDatabase, "public"> & {
  public: Omit<RawDatabase["public"], "Functions"> & {
    Functions: {
      match_documents: {
        Args: Omit<RawMatchDocuments["Args"], "query_embedding"> & {
          query_embedding: number[]
        }
        Returns: RawMatchDocuments["Returns"]
      }
    }
  }
}
