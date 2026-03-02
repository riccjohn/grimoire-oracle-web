import fs from "node:fs"
import path from "node:path"

const runIngestionPipeline = async () => {
  console.log("Starting ingestion pipeline ...")

  console.log("📂 Loading vault...")
  const docs = loadVaultFiles("./vault/")
  console.log(`✅ Loaded ${docs.length} documents:`)
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
  const results: Array<{ source: string; content: string }> = []

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

runIngestionPipeline()
