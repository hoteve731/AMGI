import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Set cookie options at the correct level
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 30, // 30일
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  )
}
