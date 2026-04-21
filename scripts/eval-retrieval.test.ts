import { RECALL_K_THRESHOLD } from "@/lib/constants"
import type { DocumentMatch } from "@/lib/retrieval"
import { checkHit, computeRecall, findRank, isPassing } from "./eval-retrieval"

vi.mock("@/lib/supabase-client", () => ({
  supabaseClient: { rpc: vi.fn() },
}))

describe("eval-retrieval", () => {
  describe("checkHit", () => {
    const makeChunk = (content: string) => ({
      id: 1,
      content,
      metadata: { source: "test.md", title: "Test" },
      similarity: 0.9,
    })

    test(`returns 'true' when a chunks content contains the given substring`, () => {
      const chunks = [
        makeChunk(
          "Chainmail Armor provides AC 5 and is available for purchase"
        ),
        makeChunk(
          "Cursed swords specify a penalty applied to both attack rolls and damage rolls made with the weapon."
        ),
      ]

      const result = checkHit(chunks, "Chainmail")
      expect(result).toBe(true)
    })

    test(`returns 'false' when no chunk contains the given substring`, () => {
      const chunks = [
        makeChunk(
          "Chainmail Armor provides AC 5 and is available for purchase"
        ),
        makeChunk(
          "Cursed swords specify a penalty applied to both attack rolls and damage rolls made with the weapon."
        ),
      ]

      const result = checkHit(chunks, "Foo Bar Baz")

      expect(result).toBe(false)
    })

    test(`returns 'false' when given an empty chunks array`, () => {
      const result = checkHit([], "foo")

      expect(result).toBe(false)
    })
  })

  describe("computeRecall", () => {
    test(`returns '1.0' when hits equals total`, () => {
      expect(computeRecall(10, 10)).toBe(1.0)
    })

    test(`returns '0.0' when hits is 0`, () => {
      expect(computeRecall(0, 10)).toBe(0)
    })

    test(`returns '0.5' for half hits`, () => {
      expect(computeRecall(5, 10)).toBe(0.5)
    })
  })

  describe("isPassing", () => {
    test(`returns 'true' when recall is above threshold`, () => {
      expect(isPassing(1.0, RECALL_K_THRESHOLD)).toBe(true)
    })

    test(`returns 'true' when recall equals threshold exactly`, () => {
      expect(isPassing(RECALL_K_THRESHOLD, RECALL_K_THRESHOLD)).toBe(true)
    })

    test(`returns 'false' when recall is below threshold`, () => {
      expect(isPassing(0.5, RECALL_K_THRESHOLD)).toBe(false)
    })
  })

  describe("findRank", () => {
    const makeChunk = (content: string): DocumentMatch => ({
      id: 1,
      content,
      metadata: { source: "test.md", title: "Test" },
      similarity: 0.9,
    })

    test(`returns 1 when the substring matches the first chunk`, () => {
      const chunks = [
        makeChunk(
          "Plate Mail provides the best protection available to fighters."
        ),
        makeChunk("Leather Armor is the lightest armor available."),
        makeChunk("Chain Mail provides moderate protection."),
      ]

      const result = findRank(chunks, "Plate Mail")
      expect(result).toBe(1)
    })

    test(`returns 3 when the substring matches the third chunk`, () => {
      const chunks = [
        makeChunk(
          "Plate Mail provides the best protection available to fighters."
        ),
        makeChunk("Leather Armor is the lightest armor available."),
        makeChunk("Chain Mail provides moderate protection."),
      ]

      const result = findRank(chunks, "Chain Mail")
      expect(result).toBe(3)
    })

    test(`returns -1 when the substring is not found in any chunk`, () => {
      const chunks = [
        makeChunk(
          "Plate Mail provides the best protection available to fighters."
        ),
        makeChunk("Leather Armor is the lightest armor available."),
        makeChunk("Chain Mail provides moderate protection."),
      ]

      const result = findRank(chunks, "Foo Bar Baz")
      expect(result).toBe(-1)
    })

    test(`is case-sensitive (a substring differing only in case returns -1)`, () => {
      const chunks = [
        makeChunk(
          "Plate Mail provides the best protection available to fighters."
        ),
        makeChunk("Leather Armor is the lightest armor available."),
      ]

      const result = findRank(chunks, "plate mail")
      expect(result).toBe(-1)
    })
  })
})
