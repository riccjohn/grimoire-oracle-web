import { createStuffDocumentsChain } from "@langchain/classic/chains/combine_documents"
import { createRetrievalChain } from "@langchain/classic/chains/retrieval"
import { CohereEmbeddings } from "@langchain/cohere"
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase"
import { ChatPromptTemplate } from "@langchain/core/prompts"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import {
  CHATBOT_MODEL,
  EMBEDDING_MODEL,
  SUPABASE_TABLE_NAME,
} from "@/lib/constants"
import { supabaseClient } from "@/lib/supabase-client"

/** Number of document chunks to retrieve from the vector store per query. */
const RETRIEVAL_K = 5

/**
 * Assembles the RAG chain for the Grimoire Oracle.
 *
 * Retrieves the top {@link RETRIEVAL_K} relevant document chunks from Supabase
 * (via Cohere embeddings), stuffs them into a prompt, and passes it to Gemini
 * for answer generation.
 *
 * @returns A LangChain retrieval chain that accepts `{ input: string }` and returns `{ answer: string, context: Document[] }`.
 */
export const createOracleChain = async () => {
  const embeddings = new CohereEmbeddings({ model: EMBEDDING_MODEL })

  const vectorStore = new SupabaseVectorStore(embeddings, {
    client: supabaseClient,
    tableName: SUPABASE_TABLE_NAME,
    queryName: "match_documents",
  })

  const retriever = vectorStore.asRetriever({ k: RETRIEVAL_K })

  const llm = new ChatGoogleGenerativeAI({ model: CHATBOT_MODEL })

  const prompt = createAnswerPrompt()

  const combineDocsChain = await createStuffDocumentsChain({ llm, prompt })
  const retrievalChain = await createRetrievalChain({
    retriever,
    combineDocsChain,
  })

  return retrievalChain
}

/**
 * Creates the prompt template for answer generation.
 * The {context} placeholder will be filled with retrieved documents.
 */
const createAnswerPrompt = (): ChatPromptTemplate => {
  const systemPrompt = `You are the Grimoire Oracle, a wizard knowledgeable in TTRPG rules like Old School Essentials (BX D&D). Answer questions using ONLY the context provided below. IMPORTANT: If the context does not contain the answer, say "I couldn't find that information in the rules." Do NOT make up or invent any rules, numbers, or game mechanics. Context: {context}`

  return ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    ["human", "{input}"],
  ])
}
