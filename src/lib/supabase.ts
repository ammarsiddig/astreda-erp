import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Fallback to hardcoded values so production builds (Vercel) work even without
// env vars configured in the dashboard. The anon key is a public credential.
const FALLBACK_URL = 'https://prwvpcxwodidfijytfuh.supabase.co'
const FALLBACK_KEY = 'sb_publishable_mBWbKcJWrKQZBrp46uDIxg_x6G7rGPJ'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || FALLBACK_URL
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || FALLBACK_KEY

export { supabaseUrl, supabaseAnonKey }

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: { eventsPerSecond: 20 },
  },
  global: {
    headers: { 'Accept-Encoding': 'gzip' },
  },
  db: {
    schema: 'public',
  },
})

export const isSupabaseConfigured = (): boolean => true
