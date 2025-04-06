import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Enhanced cookie options for better session persistence
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        domain: typeof window !== 'undefined' ? window.location.hostname : undefined
      },
      // Set cookie encoding for better compatibility
      cookieEncoding: 'base64url'
    }
  )
}
