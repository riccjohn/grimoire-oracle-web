import { RECALL_K_THRESHOLD } from "@/lib/constants"
import { DocumentMatch, retrieveRawChunks } from "@/lib/retrieval"
import fixtures from "@/scripts/eval-fixtures.json"

const main = async () => {
  const hits = await fixtures.reduce(async (accPromise, fixture) => {
    const acc = await accPromise
    const chunks = await retrieveRawChunks(fixture.question)
    const hit = checkHit(chunks, fixture.expectedChunkSubstring)
    console.log(
      `${hit ? "PASS" : `FAIL (expected in: ${fixture.source})`} — ${fixture.question}`
    )
    return acc + (hit ? 1 : 0)
  }, Promise.resolve(0))

  const recall = computeRecall(hits, fixtures.length)
  console.log(`\nRecall@K: ${hits}/${fixtures.length} = ${recall.toFixed(2)}`)

  if (isPassing(recall, RECALL_K_THRESHOLD)) {
    console.log("\nPASS")
    process.exit(0)
  } else {
    console.log(`\nFAIL: recall below ${RECALL_K_THRESHOLD * 100}% threshold`)
    process.exit(1)
  }
}

export const checkHit = (chunks: DocumentMatch[], substring: string) => {
  return chunks.some(({ content }) => content.includes(substring))
}

export const computeRecall = (hits: number, total: number) => {
  if (total === 0) {
    return 0
  }
  return hits / total
}

export const isPassing = (recallK: number, recallKThreshold: number) => {
  return recallK >= recallKThreshold
}

if (import.meta.url === new URL(process.argv[1], import.meta.url).href) {
  main()
}
