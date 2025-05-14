import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// 로컬 테스트용 API 엔드포인트
// 실제 프로덕션 환경에서는 제거해야 합니다!
export async function GET(req: NextRequest) {
    try {
        // 쿼리 파라미터에서 액션 가져오기
        const { searchParams } = new URL(req.url);
        const action = searchParams.get('action') || 'activate';
        const userId = searchParams.get('userId'); // URL에서 사용자 ID를 직접 받을 수도 있음

        // 서비스 롤을 사용하는 Supabase 클라이언트 생성
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // 일반 클라이언트 (세션 확인용)
        const supabase = createRouteHandlerClient({ cookies });

        // 사용자 ID 확인
        let targetUserId = userId;

        // userId가 제공되지 않은 경우 세션에서 시도
        if (!targetUserId) {
            const { data: { session } } = await supabase.auth.getSession();

            if (session?.user?.id) {
                targetUserId = session.user.id;
                console.log('세션에서 사용자 ID 찾음:', targetUserId);
            } else {
                console.error('인증 실패: 세션 없음, 사용자 ID도 없음');
                return NextResponse.json({
                    error: '인증되지 않은 사용자',
                    message: '로그인 후 다시 시도하거나 URL에 userId 파라미터를 추가하세요'
                }, { status: 401 });
            }
        }

        console.log(`테스트 구독 API: 사용자 ${targetUserId}의 구독 ${action} 처리 중`);

        // 사용자가 존재하는지 확인 (서비스 롤 사용)
        const { data: userExists, error: userCheckError } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('id', targetUserId)
            .single();

        if (userCheckError || !userExists) {
            console.error('사용자를 찾을 수 없음:', targetUserId);

            // 사용자가 존재하지 않으면 생성 시도 (서비스 롤 사용)
            const { error: insertError } = await supabaseAdmin
                .from('users')
                .insert({
                    id: targetUserId,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (insertError) {
                console.error('사용자 생성 실패:', insertError);
                return NextResponse.json({
                    error: '사용자를 찾거나 생성할 수 없음',
                    details: insertError.message
                }, { status: 404 });
            }

            console.log('새 사용자 생성됨:', targetUserId);
        }

        // 액션에 따라 구독 상태 업데이트 (서비스 롤 사용)
        if (action === 'activate') {
            // 구독 활성화
            const { data, error } = await supabaseAdmin
                .from('users')
                .update({
                    is_premium: true,
                    subscription_status: 'active',
                    subscription_id: `test_sub_${Date.now()}`,
                    subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', targetUserId)
                .select();

            if (error) {
                console.error('구독 활성화 실패:', error);
                return NextResponse.json({
                    error: '구독 활성화 실패',
                    details: error.message
                }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                message: '구독이 활성화되었습니다.',
                userId: targetUserId,
                data
            });
        } else if (action === 'deactivate') {
            // 구독 비활성화
            const { data, error } = await supabaseAdmin
                .from('users')
                .update({
                    is_premium: false,
                    subscription_status: 'cancelled',
                    updated_at: new Date().toISOString()
                })
                .eq('id', targetUserId)
                .select();

            if (error) {
                console.error('구독 비활성화 실패:', error);
                return NextResponse.json({
                    error: '구독 비활성화 실패',
                    details: error.message
                }, { status: 500 });
            }

            return NextResponse.json({
                success: true,
                message: '구독이 비활성화되었습니다.',
                userId: targetUserId,
                data
            });
        }

        return NextResponse.json({ error: '잘못된 액션' }, { status: 400 });
    } catch (error) {
        console.error('테스트 구독 API 오류:', error);
        return NextResponse.json({
            error: '서버 오류',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
