import { execSync } from "node:child_process"

const url = process.env.SUPABASE_URL
if (!url) throw new Error("SUPABASE_URL is not set")

const projectId = new URL(url).hostname.split(".")[0]

execSync(
  `supabase gen types typescript --project-id ${projectId} > supabase/database.types.ts`,
  {
    stdio: "inherit",
    shell: "/bin/sh",
  }
)
