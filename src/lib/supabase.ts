import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Fallback to hardcoded values so production builds (Vercel) work even without
// env vars configured in the dashboard. The anon key is a public credential.
const FALLBACK_URL = 'https://prwvpcxwodidfijytfuh.supabase.co'
const FALLBACK_KEY = 'sb_publishable_mBWbKcJWrKQZBrp46uDIxg_x6G7rGPJ'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || FALLBACK_URL
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || FALLBACK_KEY

console.log('[supabase] URL:', supabaseUrl)
console.log('[supabase] Key present:', !!supabaseAnonKey)

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)

export const isSupabaseConfigured = (): boolean => true
