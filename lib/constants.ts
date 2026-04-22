export const SUPABASE_TABLE_NAME = "documents"
export const SUPABASE_MATCH_DOCUMENTS_FUNCTION = "match_documents"
export const EMBEDDING_MODEL = "embed-english-v3.0"
export const CHATBOT_MODEL = "claude-haiku-4-5"
/** Number of document chunks to retrieve per query. Tuned down from 10; no recall regression on eval fixtures. */
export const RETRIEVAL_K = 5
export const RECALL_K_THRESHOLD = 0.8

export const DEBUG = process.env.DEBUG === "true"
export const CHATBOT_ENABLED = process.env.CHATBOT_ENABLED !== "false"
