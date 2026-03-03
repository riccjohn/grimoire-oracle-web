import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { enrichChunksWithMetadata, loadVaultFiles, splitMarkdownDocs } from "./ingest"

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
        content: "# Combat\nOverview.\n## Melee\nClose range.\n### Initiative\nRoll d6.",
      },
    ]

    const result = splitMarkdownDocs(docs)

    expect(result).toHaveLength(3)
    expect(result[0].content).toBe("# Combat\nOverview.")
    expect(result[1].content).toBe("## Melee\nClose range.")
    expect(result[2].content).toBe("### Initiative\nRoll d6.")
  })

  // <- B
  it("filters out empty chunks from back-to-back headers", () => {
    const docs = [
      {
        source: "vault/spells.md",
        content: "# Fireball\n## Range\n150 feet.",
      },
    ]

    const result = splitMarkdownDocs(docs)

    expect(result.every((chunk) => chunk.content.trim().length > 0)).toBe(true)
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
    const chunks = [{ source: "vault/Monsters/Goblin.md", content: "Small and mean." }]

    const result = enrichChunksWithMetadata(chunks)

    expect(result).toHaveLength(1)
  })

  it("sets metadata.source to the original source path", () => {
    const chunks = [{ source: "vault/Monsters/Goblin.md", content: "Small and mean." }]

    const result = enrichChunksWithMetadata(chunks)

    expect(result[0].metadata.source).toBe("vault/Monsters/Goblin.md")
  })

  it("sets metadata.title to the derived title", () => {
    const chunks = [{ source: "vault/Monsters/Goblin.md", content: "Small and mean." }]

    const result = enrichChunksWithMetadata(chunks)

    expect(result[0].metadata.title).toBe("Monsters > Goblin")
  })

  it("derives 'X Class' title for class files", () => {
    const chunks = [{ source: "vault/Classes/Thief.md", content: "Sneaky." }]

    const result = enrichChunksWithMetadata(chunks)

    expect(result[0].metadata.title).toBe("Thief Class")
  })

  it("strips 'rules' prefix from breadcrumb titles", () => {
    const chunks = [{ source: "vault/rules/Combat.md", content: "Roll to hit." }]

    const result = enrichChunksWithMetadata(chunks)

    expect(result[0].metadata.title).toBe("Combat")
  })
})
