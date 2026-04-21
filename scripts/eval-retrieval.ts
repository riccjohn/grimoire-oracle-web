import { RECALL_K_THRESHOLD } from "@/lib/constants"
import { DocumentMatch, retrieveRawChunks } from "@/lib/retrieval"
import fixtures from "@/scripts/eval-fixtures.json"

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
}

const main = async () => {
  console.log(
    c.bold(
      `\nRunning eval against ${fixtures.length} fixtures (K=${RECALL_K_THRESHOLD * 100}% threshold)\n`
    )
  )

  const hits = await fixtures.reduce(async (accPromise, fixture) => {
    const acc = await accPromise
    const chunks = await retrieveRawChunks(fixture.question)
    const hit = checkHit(chunks, fixture.expectedChunkSubstring)
    const rank = findRank(chunks, fixture.expectedChunkSubstring)
    const rankLabel = rank === -1 ? c.dim("not found") : c.cyan(`rank ${rank}`)
    const status = hit ? c.green("PASS") : c.red("FAIL")
    const source = hit ? "" : c.dim(` (expected in: ${fixture.source})`)
    console.log(`${status} [${rankLabel}] — ${fixture.question}${source}`)
    return acc + (hit ? 1 : 0)
  }, Promise.resolve(0))

  const recall = computeRecall(hits, fixtures.length)
  console.log(
    `\n${c.bold("Recall@K:")} ${hits}/${fixtures.length} = ${recall.toFixed(2)}`
  )

  if (isPassing(recall, RECALL_K_THRESHOLD)) {
    console.log(c.bold(c.green("\nPASS")))
    process.exit(0)
  } else {
    console.log(
      c.bold(
        c.red(`\nFAIL: recall below ${RECALL_K_THRESHOLD * 100}% threshold`)
      )
    )
    process.exit(1)
  }
}

export const findRank = (
  chunks: DocumentMatch[],
  substring: string
): number => {
  const index = chunks.findIndex(({ content }) => content.includes(substring))
  return index === -1 ? -1 : index + 1
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
