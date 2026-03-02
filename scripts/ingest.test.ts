import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadVaultFiles } from "./ingest"

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
