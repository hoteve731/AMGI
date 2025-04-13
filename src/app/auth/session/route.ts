import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { session }, error } = await supabase.auth.getSession()

    if (error || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 세션 갱신 시도
    const { data: { session: refreshedSession }, error: refreshError } = 
      await supabase.auth.refreshSession()

    if (refreshError) {
      return NextResponse.json({ error: 'Failed to refresh session' }, { status: 401 })
    }

    return NextResponse.json({ 
      message: 'Session refreshed successfully',
      user: refreshedSession?.user 
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}