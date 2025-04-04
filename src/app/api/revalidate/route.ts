import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function POST(request: NextRequest) {
  try {
    // Revalidate the home page path
    revalidatePath('/')
    
    return NextResponse.json({ 
      revalidated: true,
      now: Date.now(),
      message: 'Revalidation triggered successfully'
    })
  } catch (err) {
    console.error('Revalidation error:', err)
    return NextResponse.json({ 
      revalidated: false,
      now: Date.now(),
      message: 'Error during revalidation'
    }, { status: 500 })
  }
}
