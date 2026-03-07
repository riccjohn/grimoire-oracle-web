import { cohere } from "@ai-sdk/cohere"
import { embed } from "ai"
import {
  DEBUG,
  EMBEDDING_MODEL,
  RETRIEVAL_K,
  SUPABASE_MATCH_DOCUMENTS_FUNCTION,
} from "@/lib/constants"
import { supabaseClient } from "@/lib/supabase-client"
import type { Database } from "@/supabase/database"

export type DocumentMatch =
  Database["public"]["Functions"]["match_documents"]["Returns"][number]

const retrieveContext = async (query: string) => {
  const rows = await retrieveRawChunks(query)
  return rows.map((row) => row.content).join("\n\n")
}

const retrieveRawChunks = async (query: string) => {
  const model = cohere.embeddingModel(EMBEDDING_MODEL)
  const { embedding } = await embed({ model, value: query })

  if (DEBUG) console.log(`[oracle] query: "${query}"`)

  const rows = await supabaseClient.rpc(SUPABASE_MATCH_DOCUMENTS_FUNCTION, {
    query_embedding: embedding,
    match_count: RETRIEVAL_K,
  })

  if (rows.error) {
    throw new Error(`Error fetching relevant rows: ${rows.error.message}`)
  }

  if (DEBUG) {
    console.log(`[oracle] retrieved ${rows.data.length} docs`)
    rows.data.forEach((row: DocumentMatch, i: number) => {
      console.log(`[oracle] doc[${i}]: ${row.content.slice(0, 120)}...`)
    })
  }

  return rows.data
}

export { retrieveContext, retrieveRawChunks }
