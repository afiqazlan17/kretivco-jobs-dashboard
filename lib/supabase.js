import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// If no Supabase config, we run in mock mode
export const isMockMode = !url || !key

export const supabase = isMockMode ? null : createClient(url, key, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
})
