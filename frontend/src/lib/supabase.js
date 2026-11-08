import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error('Supabase public configuration is missing.')
}

// This client intentionally receives only the browser-safe publishable key.
// Never add a Supabase secret/service-role key to VITE_ variables.
export const supabase = createClient(url, publishableKey)
