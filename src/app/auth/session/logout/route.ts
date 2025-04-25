import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()

    // 서버 측에서 세션 종료
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Error signing out:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 쿠키 삭제를 위한 응답 설정
    const response = NextResponse.json({
      message: 'Successfully logged out'
    })

    // 모든 Supabase 관련 쿠키 삭제
    response.cookies.set('supabase-auth-token', '', {
      expires: new Date(0),
      path: '/'
    })

    response.cookies.set('sb-refresh-token', '', {
      expires: new Date(0),
      path: '/'
    })

    response.cookies.set('sb-access-token', '', {
      expires: new Date(0),
      path: '/'
    })

    return response
  } catch (error) {
    console.error('Unexpected error during logout:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred during logout' },
      { status: 500 }
    )
  }
}