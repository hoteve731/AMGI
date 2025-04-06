import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          try {
            return cookieStore.get(name)?.value
          } catch (error) {
            console.error('Failed to get cookie', error)
            return undefined
          }
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            // Enhance cookie settings for better persistence
            const enhancedOptions = {
              ...options,
              maxAge: 60 * 60 * 24 * 30, // 30 days
              path: '/',
              sameSite: 'lax' as const,
              secure: process.env.NODE_ENV === 'production',
              httpOnly: true,
            };

            cookieStore.set({ name, value, ...enhancedOptions })
          } catch (error) {
            console.error('Failed to set cookie', error)
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            console.error('Failed to remove cookie', error)
          }
        },
      },
      cookieEncoding: 'base64url',
    }
  )
}
