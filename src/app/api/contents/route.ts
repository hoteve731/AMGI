// 기존 코드 유지...

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Content ID is required' }, { status: 400 });
    }

    const supabase = await createClient();
    
    // 인증 확인
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // 현재 사용자의 콘텐츠만 삭제할 수 있도록 함
    const { error } = await supabase
      .from('contents')
      .delete()
      .match({
        id: id,
        user_id: session.user.id
      });
    
    if (error) {
      console.error('Error deleting content:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' }, 
      { status: 500 }
    );
  }
}import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Fetch contents for the authenticated user
    const { data, error } = await supabase
      .from('contents')
      .select('id, title, created_at, status, chunks')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching contents:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ contents: data || [] })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' }, 
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const { id, status } = await request.json();
    
    if (!id || !status) {
      return NextResponse.json({ error: 'Content ID and status are required' }, { status: 400 });
    }
    
    // Validate status value
    if (!['studying', 'completed', 'paused'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
    }
    
    const supabase = await createClient();
    
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Update content status for the authenticated user
    const { data, error } = await supabase
      .from('contents')
      .update({ status })
      .match({
        id: id,
        user_id: session.user.id
      })
      .select();
    
    if (error) {
      console.error('Error updating content status:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, content: data?.[0] || null });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' }, 
      { status: 500 }
    );
  }
}