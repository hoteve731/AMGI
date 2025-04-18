import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()

        // 인증 확인 (관리자 또는 개발자만 접근 가능)
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        if (userError || !user) {
            return NextResponse.json({ error: '인증되지 않은 사용자입니다.' }, { status: 401 })
        }

        // Supabase SQL 쿼리를 사용하여 contents 테이블에서 status 필드 삭제
        // 주의: Supabase는 열 삭제를 위한 직접 API를 제공하지 않아 SQL 쿼리 사용
        const { error: alterTableError } = await supabase.rpc('alter_table_drop_column', {
            table_name: 'contents',
            column_name: 'status'
        });

        if (alterTableError) {
            console.error('status 필드 삭제 중 오류:', alterTableError);
            return NextResponse.json({
                error: '마이그레이션 중 오류가 발생했습니다.',
                details: alterTableError.message
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'contents 테이블에서 status 필드가 성공적으로 제거되었습니다.'
        });
    } catch (error) {
        console.error('예상치 못한 오류:', error);
        return NextResponse.json(
            {
                error: '서버 오류가 발생했습니다.',
                details: error instanceof Error ? error.message : String(error)
            },
            { status: 500 }
        );
    }
} 