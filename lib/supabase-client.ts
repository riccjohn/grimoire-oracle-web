import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  const missingKeys = []

  if (!supabaseUrl) {
    missingKeys.push("SUPABASE_URL")
  }

  if (!supabaseKey) {
    missingKeys.push("SUPABASE_ANON_KEY")
  }

  throw new Error(
    `Missing required environment variables: ${missingKeys.join(" and ")}`
  )
}

export const supabaseClient = createClient(supabaseUrl, supabaseKey)
