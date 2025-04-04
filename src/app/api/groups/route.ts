import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(request: Request) {
    try {
        const { id } = await request.json()

        if (!id) {
            return NextResponse.json(
                { error: '그룹 ID가 필요합니다.' },
                { status: 400 }
            )
        }

        const supabase = await createClient()

        // 1. 먼저 그룹에 속한 청크들을 삭제
        const { error: chunksError } = await supabase
            .from('content_chunks')
            .delete()
            .eq('group_id', id)

        if (chunksError) {
            throw chunksError
        }

        // 2. 그룹 삭제
        const { error: groupError } = await supabase
            .from('content_groups')
            .delete()
            .eq('id', id)

        if (groupError) {
            throw groupError
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('그룹 삭제 중 오류:', error)
        return NextResponse.json(
            { error: '그룹 삭제 중 오류가 발생했습니다.' },
            { status: 500 }
        )
    }
} 