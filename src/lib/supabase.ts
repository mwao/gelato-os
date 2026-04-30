import { createClient } from '@supabase/supabase-js'

/**
 * Project URL must be only `https://<ref>.supabase.co` (Project Settings → API).
 * If `.../rest/v1` is pasted by mistake, Auth calls become `.../rest/v1/auth/v1/signup` → 404.
 */
function normalizeSupabaseProjectUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, '')
  url = url.replace(/\/rest\/v1\/?$/i, '')
  return url.replace(/\/+$/, '')
}

const supabaseUrl = normalizeSupabaseProjectUrl(
  import.meta.env.VITE_SUPABASE_URL ?? '',
)
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env')
}

if (import.meta.env.DEV && (import.meta.env.VITE_SUPABASE_URL ?? '').includes('/rest/')) {
  // eslint-disable-next-line no-console -- intentional setup hint
  console.warn(
    '[supabase] VITE_SUPABASE_URL should not include /rest/v1. Using project root:',
    supabaseUrl,
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
