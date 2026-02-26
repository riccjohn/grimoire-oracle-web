import { DirectoryLoader } from "@langchain/classic/document_loaders/fs/directory"
import { TextLoader } from "@langchain/classic/document_loaders/fs/text"
import { MarkdownTextSplitter } from "@langchain/classic/text_splitter"
import { CohereEmbeddings } from "@langchain/cohere"
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase"
import type { Document } from "@langchain/core/documents"
import { supabaseClient } from "./supabase-admin"

const CHUNK_SIZE = 1000
const CHUNK_OVERLAP = 100
const MIN_CHUNK_SIZE = 100
const SUPABASE_TABLE_NAME = "documents"

type Chunk = Document<Record<string, unknown>>

const main = async () => {
  console.log("Starting ingestion pipeline ...")

  try {
    const docs = await loadDocs("./vault/")
    const chunks = await splitDocsIntoChunks(docs)
    const mergedChunks = mergeSmallChunks(chunks)
    const enrichedChunks = enrichChunksWithMetadata(mergedChunks)
    await createVectorIndex(enrichedChunks)
  } catch (error) {
    console.error("❌ Ingestion failed:", error)
    process.exit(1)
  }
}

/**
 * Loads all markdown files from a directory into LangChain Document objects.
 * @param docPath - Path to the directory containing markdown files
 * @returns Array of Document objects with pageContent and metadata.source
 */
const loadDocs = async (docPath: string) => {
  console.log("📂 Loading vault...")

  const loader = new DirectoryLoader(docPath, {
    ".md": (path) => new TextLoader(path),
  })

  const docs = await loader.load()

  console.log(`✅ Loaded ${docs.length} documents:\n`)

  return docs
}

/**
 * Splits documents into smaller chunks for embedding.
 * Uses recursive character splitting with configurable size and overlap.
 * @param docs - Array of Document objects to split
 * @returns Array of smaller Document chunks, each preserving original metadata
 */
const splitDocsIntoChunks = async (docs: Chunk[]) => {
  console.log("\n✂️ Splitting into chunks...")

  const splitter = new MarkdownTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  })

  const chunks = await splitter.splitDocuments(docs)
  console.log(`✅ Created ${chunks.length} chunks:\n`)
  return chunks
}

/**
 * Merges small chunks with the following chunk from the same document.
 * Prevents orphaned headers from becoming standalone chunks.
 * @param chunks - Array of Document chunks
 * @returns Array with small chunks merged into their neighbors
 */
const mergeSmallChunks = (chunks: Document<Record<string, unknown>>[]) => {
  console.log("\n🔗 Merging small chunks...")

  const result = chunks.reduce<{
    merged: Document<Record<string, unknown>>[]
    skipNext: boolean
  }>(
    (acc, current, index) => {
      if (acc.skipNext) {
        return { merged: acc.merged, skipNext: false }
      }

      const next = chunks[index + 1]
      const shouldMerge =
        current.pageContent.length < MIN_CHUNK_SIZE &&
        next &&
        current.metadata.source === next.metadata.source

      if (shouldMerge) {
        return {
          merged: [
            ...acc.merged,
            {
              pageContent: current.pageContent + "\n\n" + next.pageContent,
              metadata: current.metadata,
            },
          ],
          skipNext: true,
        }
      }

      return { merged: [...acc.merged, current], skipNext: false }
    },
    { merged: [], skipNext: false }
  )

  console.log(`✅ Merged ${chunks.length} → ${result.merged.length} chunks`)
  return result.merged
}

/**
 * Extracts a searchable title from a file path.
 * For class files, returns just the class name (e.g., "Thief").
 * For other files, returns breadcrumb format (e.g., "Monsters > Dragon").
 * @param filepath - Full path to the markdown file
 * @returns Title string optimized for embedding similarity
 */
const extractTitleFromPath = (filepath: string) => {
  const vaultIndex = filepath.indexOf("vault/")
  const relativePath =
    vaultIndex !== -1 ? filepath.slice(vaultIndex + "vault/".length) : filepath

  const segments = relativePath
    .replace(/\.md$/, "")
    .split("/")
    .map((segment) => segment.replace(/^\d+[a-z]?[\.\-]\s*/, ""))

  // For class files, return "X Class" for better matching with queries like
  // "Tell me about the Thief class" -> matches "[Thief Class]"
  if (segments.includes("Classes") && segments.length >= 2) {
    const className = segments[segments.length - 1]
    // Skip generic files like "Character Classes"
    if (className !== "Character Classes") {
      return `${className} Class`
    }
  }

  // For other files, use breadcrumb but skip "rules" prefix
  return segments.filter((s) => s !== "rules").join(" > ")
}

/**
 * Prepends document title to each chunk's content to improve retrieval.
 * Helps embedding models match user queries like "Light spell" to relevant chunks.
 * @param chunks - Array of Document chunks with metadata.source containing file paths
 * @returns Array of chunks with titles prepended to pageContent
 */
const enrichChunksWithMetadata = (chunks: Chunk[]) => {
  console.log("🧂 Enriching chunks with metadata")
  return chunks.map((chunk) => {
    const filepath =
      typeof chunk.metadata.source === "string"
        ? chunk.metadata.source
        : "unknown"
    const title = extractTitleFromPath(filepath)
    return { ...chunk, pageContent: `[${title}]\n${chunk.pageContent}` }
  })
}

/**
 * Converts document chunks into vector embeddings and inserts them into Supabase.
 * @param chunks - Document chunks to vectorize
 */
const createVectorIndex = async (chunks: Chunk[]) => {
  console.log("🧠 Creating embeddings (this may take a moment)...")

  const embeddingModel = new CohereEmbeddings({
    model: "embed-english-v3.0",
  })

  // Delete existing documents to prevent duplicate entries
  const { error } = await supabaseClient.from("documents").delete().neq("id", 0)
  if (error) throw new Error(`Failed to clear documents: ${error.message}`)
  console.log("🗑  Cleared existing documents...")

  await SupabaseVectorStore.fromDocuments(chunks, embeddingModel, {
    client: supabaseClient,
    tableName: SUPABASE_TABLE_NAME,
  })

  console.log("✅ Index saved to Supabase ⚡️")
}

main()
