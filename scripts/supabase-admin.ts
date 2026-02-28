import { createClient } from "@supabase/supabase-js"

/**
 * Used for ingestion pipeline ONLY
 */

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  const hasSupabaseUrl = !!supabaseUrl
  const hasSupabaseKey = !!supabaseKey

  console.log({
    hasSupabaseUrl,
    hasSupabaseKey,
  })
  throw new Error(
    "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  )
}

export const supabaseClient = createClient(supabaseUrl, supabaseKey)
