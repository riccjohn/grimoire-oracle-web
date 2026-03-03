import fs from "node:fs"
import path from "node:path"

const MAX_CHUNK_SIZE = 1000

type Document = { source: string; content: string }
type EnrichedChunk = {
  metadata: { source: string; title: string }
  content: string
}

const runIngestionPipeline = async () => {
  console.log("Starting ingestion pipeline ...")

  console.log("📂 Loading vault...")
  const docs = loadVaultFiles("./vault/")
  console.log(`✅ Loaded ${docs.length} documents:`)
  const chunks = splitMarkdownDocs(docs)
  const enrichedChunks = enrichChunksWithMetadata(chunks)
}

/**
 * Recursively walks `dir` and returns all `.md` files found.
 *
 * @param dir - Path to the directory to search (absolute or relative to cwd).
 * @returns An array of `{ source, content }` objects — one per `.md` file —
 * where `source` is the full file path and `content` is the raw UTF-8 text.
 * @throws If `dir` does not exist or cannot be read.
 */
export const loadVaultFiles = (dir: string) => {
  const results: Document[] = []

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      results.push(...loadVaultFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const content = fs.readFileSync(fullPath, "utf-8")
      results.push({ source: fullPath, content })
    }
  }

  return results
}

export const splitMarkdownDocs = (documents: Document[]) => {
  return documents.flatMap((doc) => {
    const { content, source } = doc
    const splitContent = content
      .split(/(?=\n#{1,3} )/)
      .flatMap((chunk) => splitLargeChunks(source, chunk.trim()))
    return splitContent
  })
}

const splitLargeChunks = (source: string, content: string) => {
  if (content.length <= MAX_CHUNK_SIZE) return [{ source, content }]

  const slices: Document[] = []
  for (let i = 0; i < content.length; i += MAX_CHUNK_SIZE) {
    slices.push({ source, content: content.slice(i, i + MAX_CHUNK_SIZE) })
  }
  return slices
}

/**
 * Extracts a searchable title from a file path.
 * For class files, returns just the class name (e.g., "Thief").
 * For other files, returns breadcrumb format (e.g., "Monsters > Dragon").
 * @param filepath - Full path to the markdown file
 * @returns Title string optimized for embedding similarity
 */
const extractTitleFromPath = (filepath: string) => {
  const vaultIndex = filepath.lastIndexOf("vault/")
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
 * Adds document title to chunk metadata to improve retrieval.
 * Helps embedding models match user queries like "Light spell" to relevant chunks.
 * @param chunks - Array of  chunks
 * @returns Array of chunks with titles added as metadata
 */
export const enrichChunksWithMetadata = (chunks: Document[]) => {
  console.log("🧂 Enriching chunks with metadata")
  return chunks.map((chunk) => {
    const title = extractTitleFromPath(chunk.source)
    return {
      content: chunk.content,
      metadata: { source: chunk.source, title },
    } as EnrichedChunk
  })
}

runIngestionPipeline()
