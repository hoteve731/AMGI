import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
    const res = NextResponse.next()
    const supabase = createMiddlewareClient({ req: request, res })

    // 세션 새로고침
    await supabase.auth.getSession()

    return res
}

export const config = {
    matcher: [
        /*
         * 다음 경로들을 제외한 모든 요청에 대해 미들웨어를 실행:
         * - api (API 라우트)
         * - _next/static (정적 파일)
         * - _next/image (이미지 최적화 파일)
         * - favicon.ico (파비콘)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
} 