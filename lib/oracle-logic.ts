import { CohereEmbeddings } from "@langchain/cohere"
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase"
import { EMBEDDING_MODEL, SUPABASE_TABLE_NAME } from "@/lib/constants"
import { supabaseClient } from "@/lib/supabase-client"

const RETRIEVAL_K = 5

export const createOracleChain = async () => {
  const embeddings = new CohereEmbeddings({ model: EMBEDDING_MODEL })

  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: supabaseClient,
    tableName: SUPABASE_TABLE_NAME,
    queryName: "match_documents",
  })

  const retriever = vectorStore.asRetriever({ k: RETRIEVAL_K })

  return retriever
}
