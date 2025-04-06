import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Initialize response based on the incoming request
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          // Enhance cookie settings for better persistence
          const enhancedOptions = {
            ...options,
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: '/',
            sameSite: 'lax' as const,
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
          };
          // Set cookie on the request object (may be needed for subsequent operations)
          request.cookies.set({
            name,
            value,
            ...enhancedOptions,
          })
          // Set cookie on the response object (this is what gets sent back to the browser)
          response.cookies.set({
            name,
            value,
            ...enhancedOptions,
          })
        },
        remove(name: string, options: CookieOptions) {
          // Remove cookie from the request object
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          // Remove cookie from the response object
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
      cookieEncoding: 'base64url',
    }
  )

  try {
    // This refreshes the session if needed (triggers set/remove in cookies object)
    const { data: { session } } = await supabase.auth.getSession()

    // Proactively refresh the session if it exists
    if (session) {
      const { data: { session: refreshedSession } } = await supabase.auth.refreshSession()
      if (!refreshedSession) {
        // If session refresh failed, try to get the user anyway
        await supabase.auth.getUser()
      }
    }
  } catch (error) {
    console.error('Error refreshing session:', error)
  }

  // Return the single response object with all cookie modifications applied
  return response
}
