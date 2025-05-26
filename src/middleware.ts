import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Check if the hostname is loopa.my and redirect to turbonote.me
  const hostname = request.headers.get('host')

  if (hostname?.includes('loopa.my')) {
    // Create a new URL with the turbonote.me domain
    const url = request.nextUrl.clone()
    url.host = 'turbonote.me'

    // Keep the protocol (http/https) the same
    // Keep the pathname and search params the same

    // Return a redirect response
    return NextResponse.redirect(url, { status: 301 }) // 301 is permanent redirect
  }

  // If not loopa.my, continue with the normal session handling
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - firebase-messaging-sw.js (Firebase Service Worker)
     * - icons (public static asset route)
     * - images (public static asset route)
     * - manifest.json (public static asset route)
     * - opengraph-image.png (Open Graph image)
     * - twitter-image.png (Twitter card image)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|firebase-messaging-sw.js|icons|images|manifest.json|opengraph-image.png|twitter-image.png).*)',
  ],
}