import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add both to your .env file (and to Vercel\'s Environment Variables for production).'
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')

/**
 * The app is username-based, but Supabase Auth's built-in email/password
 * flow needs an email. We synthesize one from the username under a fake,
 * unreachable domain — the person never sees or types this, it's purely
 * an internal identifier for Supabase's auth system.
 */
export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@zelmir.local`
}
