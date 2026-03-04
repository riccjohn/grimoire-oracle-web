import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  EnrichedChunk,
  embedChunks,
  enrichChunksWithMetadata,
  loadVaultFiles,
  splitMarkdownDocs,
} from "./ingest"

vi.mock("ai", () => ({
  embedMany: vi.fn(),
}))

import { embedMany } from "ai"

const mockEmbedMany = vi.mocked(embedMany)

vi.mock("./supabase-admin", () => ({
  supabaseClient: {
    from: vi.fn(),
  },
}))

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("loadVaultFiles", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vault-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  // [TEST] returns empty array for an empty directory  <- Z
  it("returns empty array for an empty directory", () => {
    const result = loadVaultFiles(tmpDir)

    expect(result).toEqual([])
  })

  // [TEST] returns one result for a single .md file  <- O
  it("returns one result for a single .md file", () => {
    fs.writeFileSync(path.join(tmpDir, "spell.md"), "# Fireball")

    const result = loadVaultFiles(tmpDir)

    expect(result).toHaveLength(1)
  })

  // [TEST] returns all .md files from a flat directory  <- M
  it("returns all .md files in a flat directory", () => {
    fs.writeFileSync(path.join(tmpDir, "spell.md"), "# Fireball")
    fs.writeFileSync(path.join(tmpDir, "monster.md"), "# Goblin")
    fs.writeFileSync(path.join(tmpDir, "item.md"), "# Sword")

    const result = loadVaultFiles(tmpDir)

    expect(result).toHaveLength(3)
  })

  // [TEST] includes files nested in subdirectories  <- M
  it("includes .md files nested in subdirectories", () => {
    const subDir = path.join(tmpDir, "Classes")
    fs.mkdirSync(subDir)
    fs.writeFileSync(path.join(subDir, "Thief.md"), "# Thief")
    fs.writeFileSync(path.join(tmpDir, "spell.md"), "# Fireball")

    const result = loadVaultFiles(tmpDir)

    expect(result).toHaveLength(2)
  })

  // [TEST] ignores non-.md files  <- B
  it("ignores non-.md files", () => {
    fs.writeFileSync(path.join(tmpDir, "notes.txt"), "some text")
    fs.writeFileSync(path.join(tmpDir, "image.png"), "fake image")
    fs.writeFileSync(path.join(tmpDir, "spell.md"), "# Fireball")

    const result = loadVaultFiles(tmpDir)

    expect(result).toHaveLength(1)
  })

  // [TEST] result source is the full file path  <- I
  it("sets source to the full file path", () => {
    const filePath = path.join(tmpDir, "spell.md")
    fs.writeFileSync(filePath, "# Fireball")

    const result = loadVaultFiles(tmpDir)

    expect(result[0].source).toBe(filePath)
  })

  // [TEST] result content matches the file contents  <- I
  it("sets content to the file contents", () => {
    fs.writeFileSync(
      path.join(tmpDir, "spell.md"),
      "# Fireball\nDeals 8d6 fire damage."
    )

    const result = loadVaultFiles(tmpDir)

    expect(result[0].content).toBe("# Fireball\nDeals 8d6 fire damage.")
  })

  // [TEST] throws when directory does not exist  <- E
  it("throws when the directory does not exist", () => {
    expect(() => loadVaultFiles("/nonexistent/path")).toThrow()
  })
})

describe("splitMarkdownDocs", () => {
  // <- Z
  it("returns empty array for empty input", () => {
    const result = splitMarkdownDocs([])

    expect(result).toEqual([])
  })

  // <- O
  it("returns the doc as a single chunk when there are no subheaders", () => {
    const docs = [
      {
        source: "vault/spells.md",
        content: "# Fireball\nDeals 8d6 fire damage.",
      },
    ]

    const result = splitMarkdownDocs(docs)

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe("# Fireball\nDeals 8d6 fire damage.")
  })

  // <- M
  it("combines chunks from multiple docs", () => {
    const docs = [
      {
        source: "vault/spells.md",
        content: "# Fireball\nDeals 8d6 fire damage.\n## Range\n150 feet.",
      },
      {
        source: "vault/monsters.md",
        content: "# Goblin\nSmall and mean.\n## Stats\nAC 6, HD 1.",
      },
    ]

    const result = splitMarkdownDocs(docs)

    expect(result).toHaveLength(4)
  })

  // <- I
  it("preserves source on every chunk", () => {
    const docs = [
      {
        source: "vault/spells.md",
        content: "# Fireball\nDeals 8d6 fire damage.\n## Range\n150 feet.",
      },
    ]

    const result = splitMarkdownDocs(docs)

    expect(result[0].source).toBe("vault/spells.md")
    expect(result[1].source).toBe("vault/spells.md")
  })

  // <- B
  it("splits content into sections at header boundaries", () => {
    const docs = [
      {
        source: "vault/spells.md",
        content: "# Fireball\nDeals 8d6 fire damage.\n## Range\n150 feet.",
      },
    ]

    const result = splitMarkdownDocs(docs)

    expect(result[0].content).toBe("# Fireball\nDeals 8d6 fire damage.")
    expect(result[1].content).toBe("## Range\n150 feet.")
  })

  // <- B
  it("splits on all three header levels", () => {
    const docs = [
      {
        source: "vault/rules.md",
        content:
          "# Combat\nOverview.\n## Melee\nClose range.\n### Initiative\nRoll d6.",
      },
    ]

    const result = splitMarkdownDocs(docs)

    expect(result).toHaveLength(3)
    expect(result[0].content).toBe("# Combat\nOverview.")
    expect(result[1].content).toBe("## Melee\nClose range.")
    expect(result[2].content).toBe("### Initiative\nRoll d6.")
  })

  // <- B
  it("filters out empty chunks when content starts with a header", () => {
    // A document whose raw content begins with "\n## Header" produces an empty
    // string before the first header after the regex split. The filter must
    // remove it so no zero-length chunk reaches downstream steps.
    const docs = [
      {
        source: "vault/spells.md",
        content: "\n## Range\n150 feet.",
      },
    ]

    const result = splitMarkdownDocs(docs)

    expect(result.every((chunk) => chunk.content.length > 0)).toBe(true)
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe("## Range\n150 feet.")
  })

  // <- B
  it("slices chunks longer than 1000 characters", () => {
    const longBody = "x".repeat(1500)
    const docs = [
      {
        source: "vault/spells.md",
        content: `# Fireball\n${longBody}`,
      },
    ]

    const result = splitMarkdownDocs(docs)

    expect(result.length).toBeGreaterThan(1)
    expect(result.every((chunk) => chunk.content.length <= 1000)).toBe(true)
  })
})

describe("enrichChunksWithMetadata", () => {
  it("returns empty array for empty input", () => {
    const result = enrichChunksWithMetadata([])

    expect(result).toEqual([])
  })

  it("returns one enriched chunk for a single doc", () => {
    const chunks = [
      { source: "vault/Monsters/Goblin.md", content: "Small and mean." },
    ]

    const result = enrichChunksWithMetadata(chunks)

    expect(result).toHaveLength(1)
  })

  it("sets metadata.source to the original source path", () => {
    const chunks = [
      { source: "vault/Monsters/Goblin.md", content: "Small and mean." },
    ]

    const result = enrichChunksWithMetadata(chunks)

    expect(result[0].metadata.source).toBe("vault/Monsters/Goblin.md")
  })

  it("sets metadata.title to the derived title", () => {
    const chunks = [
      { source: "vault/Monsters/Goblin.md", content: "Small and mean." },
    ]

    const result = enrichChunksWithMetadata(chunks)

    expect(result[0].metadata.title).toBe("Monsters > Goblin")
  })

  it("derives 'X Class' title for class files", () => {
    const chunks = [{ source: "vault/Classes/Thief.md", content: "Sneaky." }]

    const result = enrichChunksWithMetadata(chunks)

    expect(result[0].metadata.title).toBe("Thief Class")
  })

  it("strips 'rules' prefix from breadcrumb titles", () => {
    const chunks = [
      { source: "vault/rules/Combat.md", content: "Roll to hit." },
    ]

    const result = enrichChunksWithMetadata(chunks)

    expect(result[0].metadata.title).toBe("Combat")
  })
})

describe("embedChunks", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const chunk = (content: string): EnrichedChunk => ({
    content,
    metadata: { source: "vault/spells.md", title: "Spells" },
  })

  const mockResult = (embeddings: number[][]) => ({
    embeddings,
    values: [],
    usage: { tokens: 0 },
    warnings: [],
  })

  beforeEach(() => {
    mockEmbedMany.mockReset()
  })

  // <- Z
  it("returns empty array for empty input", async () => {
    mockEmbedMany.mockResolvedValue(mockResult([]))

    const result = await embedChunks([])

    expect(result).toEqual([])
  })

  // <- O
  it("returns one EmbeddedChunk for a single input chunk", async () => {
    mockEmbedMany.mockResolvedValue(mockResult([[0.1, 0.2, 0.3]]))

    const promise = embedChunks([chunk("Fireball deals 8d6 fire damage.")])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toHaveLength(1)
  })

  // <- M
  it("returns an EmbeddedChunk for every input chunk", async () => {
    mockEmbedMany.mockResolvedValue(mockResult([[0.1], [0.2], [0.3]]))

    const promise = embedChunks([
      chunk("Fireball"),
      chunk("Goblin"),
      chunk("Sword"),
    ])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result).toHaveLength(3)
  })

  // <- B
  it("attaches the correct embedding to each chunk by index", async () => {
    mockEmbedMany.mockResolvedValue(
      mockResult([
        [0.1, 0.2],
        [0.3, 0.4],
        [0.5, 0.6],
      ])
    )

    const promise = embedChunks([chunk("A"), chunk("B"), chunk("C")])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result[0].embedding).toEqual([0.1, 0.2])
    expect(result[1].embedding).toEqual([0.3, 0.4])
    expect(result[2].embedding).toEqual([0.5, 0.6])
  })

  // <- I
  it("preserves content and metadata on each returned chunk", async () => {
    mockEmbedMany.mockResolvedValue(mockResult([[0.1, 0.2]]))
    const input = chunk("Fireball deals 8d6 fire damage.")

    const promise = embedChunks([input])
    await vi.runAllTimersAsync()
    const result = await promise

    expect(result[0].content).toBe(input.content)
    expect(result[0].metadata).toEqual(input.metadata)
  })

  // <- E
  it("throws when embedMany rejects", async () => {
    mockEmbedMany.mockRejectedValue(new Error("API error"))

    const promise = embedChunks([chunk("Fireball")]).catch((e) => e)
    await vi.runAllTimersAsync()
    const error = await promise

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe("API error")
  })

  // <- B: verify batching boundary — 97 chunks must produce exactly two embedMany calls
  it("calls embedMany twice for 97 chunks (two batches of 96 and 1)", async () => {
    // First batch: 96 embeddings, second batch: 1 embedding
    const firstBatchEmbeddings = Array.from({ length: 96 }, (_, i) => [i * 0.1])
    const secondBatchEmbeddings = [[9.6]]
    mockEmbedMany
      .mockResolvedValueOnce(mockResult(firstBatchEmbeddings))
      .mockResolvedValueOnce(mockResult(secondBatchEmbeddings))

    const chunks = Array.from({ length: 97 }, (_, i) => chunk(`chunk ${i}`))
    const promise = embedChunks(chunks)
    await vi.runAllTimersAsync()
    const result = await promise

    expect(mockEmbedMany).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(97)
  })
})
