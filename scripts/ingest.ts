import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { cohere } from "@ai-sdk/cohere"
import { embedMany } from "ai"
import cliProgress from "cli-progress"
import ora from "ora"
import { EMBEDDING_MODEL, SUPABASE_TABLE_NAME } from "@/lib/constants"
import { supabaseClient } from "./supabase-admin"

const MAX_CHUNK_SIZE = 1000
const EMBED_BATCH_SIZE = 96

export type Document = { source: string; content: string }
export type EnrichedChunk = {
  metadata: { source: string; title: string }
  content: string
}
export type EmbeddedChunk = EnrichedChunk & { embedding: number[] }

/**
 * Orchestrates the full ingestion pipeline: loads vault files, splits them
 * into chunks, enriches with metadata, embeds with Cohere, and stores in Supabase.
 */
const runIngestionPipeline = async () => {
  console.log("Starting ingestion pipeline ...")

  const loadSpinner = ora("Loading vault...").start()
  let enrichedChunks: EnrichedChunk[]
  try {
    const docs = loadVaultFiles("./vault/")
    const chunks = splitMarkdownDocs(docs)
    const expandedChunks = expandAbbreviations(chunks)
    enrichedChunks = enrichChunksWithMetadata(expandedChunks)
    loadSpinner.succeed(
      `Loaded ${docs.length} files → ${enrichedChunks.length} chunks`
    )
    console.log("🧂 Enriched chunks with metadata")
  } catch (err) {
    loadSpinner.fail(err instanceof Error ? err.message : String(err))
    throw err
  }

  const embeddedChunks = await embedChunks(enrichedChunks)
  await storeChunks(embeddedChunks)
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

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
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

/**
 * Splits an array of documents into smaller chunks by markdown heading boundaries.
 * Each heading (H1–H3) starts a new chunk; oversized chunks are further split
 * by {@link splitLargeChunks}. Empty chunks are filtered out.
 *
 * @param documents - Raw documents loaded from the vault.
 * @returns A flat array of `{ source, content }` chunks ready for enrichment.
 */
export const splitMarkdownDocs = (documents: Document[]) => {
  return documents.flatMap((doc) => {
    const { content, source } = doc
    const splitContent = content
      .split(/(?=\n#{1,3} )/)
      .flatMap((chunk) => splitLargeChunks(source, chunk.trim()))
      .filter((chunk) => chunk.content.length > 0)
    return splitContent
  })
}

/**
 * Splits a single chunk into line-aligned slices if it exceeds {@link MAX_CHUNK_SIZE}.
 * Table-aware: when a split occurs inside a markdown table, the column header row
 * is prepended to each continuation chunk so that context is preserved.
 *
 * @param source - Original file path, propagated to each slice.
 * @param content - Text content to split.
 * @returns A single-element array if the content fits, otherwise an array of slices.
 */
const splitLargeChunks = (source: string, content: string) => {
  if (content.length <= MAX_CHUNK_SIZE) return [{ source, content }]

  const lines = content.split("\n")
  const slices: Document[] = []
  let currentLines: string[] = []
  let currentLength = 0
  let activeTableHeader: string | null = null

  const flush = () => {
    if (currentLines.length > 0) {
      slices.push({ source, content: currentLines.join("\n") })
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const nextLine = lines[i + 1]

    const isNewTableHeader =
      /^\|.+\|/.test(line) &&
      nextLine !== undefined &&
      /^\|[\s:|-]+\|/.test(nextLine)

    if (
      currentLength + line.length + 1 > MAX_CHUNK_SIZE &&
      currentLines.length > 0
    ) {
      flush()
      if (activeTableHeader !== null) {
        currentLines = [activeTableHeader]
        currentLength = activeTableHeader.length + 1
      } else {
        currentLines = []
        currentLength = 0
      }
    }

    if (line.length > MAX_CHUNK_SIZE) {
      // currentLines is empty here: the flush condition above already fired
      currentLines = []
      currentLength = 0
      for (let j = 0; j < line.length; j += MAX_CHUNK_SIZE) {
        slices.push({ source, content: line.slice(j, j + MAX_CHUNK_SIZE) })
      }
      continue
    }

    if (isNewTableHeader) {
      activeTableHeader = line
    }

    currentLines.push(line)
    currentLength += line.length + 1
  }

  flush()
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

// The Thief skills table uses two-letter abbreviations (CS, TR, …) as column
// headers. Appending the full names ensures the embedding model can connect
// natural-language skill queries ("climb sheer surfaces") to the right rows.
const THIEF_SKILLS_GLOSSARY =
  "Skill column abbreviations: CS = Climb Sheer Surfaces, TR = Remove Traps, " +
  "HN = Hear Noise, HS = Hide in Shadows, MS = Move Silently, OL = Open Locks, " +
  "PP = Pick Pockets"

// All class progression tables use D/W/P/B/S as saving throw column headers.
// Without expansion, queries like "saving throw vs breath attacks" won't match
// the B column.
const SAVING_THROW_GLOSSARY =
  "Saving throw column abbreviations: D = Death / poison, W = Wands, " +
  "P = Paralysis / petrify, B = Breath attacks, S = Spells / rods / staves"

/**
 * Appends abbreviation glossaries to chunks whose tables use non-obvious short-form
 * column headers. Keeps vault files unmodified — enrichment happens at ingest time.
 * @param chunks - Chunks produced by splitMarkdownDocs
 * @returns Same chunks, with glossaries injected where needed
 */
export const expandAbbreviations = (chunks: Document[]): Document[] =>
  chunks.map((chunk) => {
    let { content } = chunk

    if (chunk.source.endsWith("7. Thief.md") && /\|\s+CS\s+\|/.test(content)) {
      content = `${content}\n\n${THIEF_SKILLS_GLOSSARY}`
    }

    if (/\|\s+D\s+\|\s+W\s+\|\s+P\s+\|\s+B\s+\|\s+S\s+\|/.test(content)) {
      content = `${content}\n\n${SAVING_THROW_GLOSSARY}`
    }

    return content === chunk.content ? chunk : { ...chunk, content }
  })

/**
 * Adds document title to chunk metadata to improve retrieval.
 * Helps embedding models match user queries like "Light spell" to relevant chunks.
 * @param chunks - Array of chunks
 * @returns Array of chunks with titles added as metadata
 */
export const enrichChunksWithMetadata = (
  chunks: Document[]
): EnrichedChunk[] => {
  return chunks.map((chunk) => {
    const title = extractTitleFromPath(chunk.source)
    return {
      content: chunk.content,
      metadata: { source: chunk.source, title },
    }
  })
}

/**
 * Embeds each chunk's content using the Cohere embedding model.
 *
 * Batches chunks into groups of {@link EMBED_BATCH_SIZE} and processes them
 * sequentially with a delay between each batch to stay within Cohere's
 * trial tier rate limit (100k tokens/minute).
 *
 * @param chunks - Enriched chunks to embed.
 * @returns The same chunks with an `embedding` vector attached to each,
 *          in the same order as the input.
 * @throws If the Cohere API call fails after retries.
 */
export const embedChunks = async (
  chunks: EnrichedChunk[]
): Promise<EmbeddedChunk[]> => {
  const model = cohere.embedding(EMBEDDING_MODEL)
  const batches = Array.from(
    { length: Math.ceil(chunks.length / EMBED_BATCH_SIZE) },
    (_, i) => chunks.slice(i * EMBED_BATCH_SIZE, (i + 1) * EMBED_BATCH_SIZE)
  )

  const bar = new cliProgress.SingleBar(
    { format: "Embedding [{bar}] {value}/{total} batches" },
    cliProgress.Presets.shades_classic
  )
  bar.start(batches.length, 0)

  try {
    const allEmbeddings = await batches.reduce(
      async (accPromise, batch, batchIndex) => {
        const acc = await accPromise
        const { embeddings } = await embedMany({
          model,
          values: batch.map((c) => c.content),
        })
        bar.increment()
        // Cohere trial tier allows ~100k tokens/minute; pause between batches to avoid rate limit.
        // Skip the delay after the last batch so ingestion finishes immediately.
        const isLastBatch = batchIndex === batches.length - 1
        if (!isLastBatch) {
          await new Promise((r) => setTimeout(r, 15_000))
        }
        return [...acc, ...embeddings]
      },
      Promise.resolve([] as number[][])
    )

    console.log(`✅ Embedded ${allEmbeddings.length} chunks`)
    return chunks.map((chunk, i) => ({ ...chunk, embedding: allEmbeddings[i] }))
  } finally {
    bar.stop()
  }
}

/**
 * Persists embedded chunks to Supabase, replacing any previously stored data.
 * Clears the table first to prevent duplicate entries, then bulk-inserts all chunks.
 *
 * @param chunks - Embedded chunks to store.
 * @throws If the delete or insert Supabase operation fails.
 */
const storeChunks = async (chunks: EmbeddedChunk[]) => {
  // Delete existing documents to prevent duplicate entries
  // PostgREST requires a filter clause on DELETE; `.neq("id", 0)` is the conventional workaround to delete all rows.
  const { error: supabaseClearError } = await supabaseClient
    .from(SUPABASE_TABLE_NAME)
    .delete()
    .neq("id", 0)

  if (supabaseClearError) {
    throw new Error(`Failed to clear documents: ${supabaseClearError.message}`)
  } else {
    console.log("🗑  Cleared existing documents...")
  }

  const { error: supabaseInsertError } = await supabaseClient
    .from(SUPABASE_TABLE_NAME)
    .insert(chunks)

  if (supabaseInsertError) {
    throw new Error(`Failed to insert chunks: ${supabaseInsertError.message}`)
  } else {
    console.log(`✅ Stored ${chunks.length} chunks`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runIngestionPipeline()
}
