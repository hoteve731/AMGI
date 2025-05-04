import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// 현재 처리 단계 결정 함수
function determineCurrentStage(content: any, groups: any[], chunksExist: boolean) {
    if (!content) return 'pending';

    switch (content.processing_status) {
        case 'title_generated':
            return 'title_generation';
        case 'groups_generating':
        case 'groups_generated':
            return 'group_creation';
        case 'chunks_generating':
            return 'chunk_generation';
        case 'completed':
            return groups.length > 0 && chunksExist ? 'completed' : 'chunk_generation';
        case 'failed':
            return 'failed';
        default:
            return 'pending';
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const contentId = searchParams.get('id');
        const timestamp = Date.now(); // 현재 타임스탬프 생성

        if (!contentId) {
            return NextResponse.json({
                error: 'Content ID is required',
                timestamp
            }, { status: 400 });
        }

        // 인증 확인
        const supabase = await createClient();
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError || !user) {
            console.error('Authentication error:', userError?.message);
            return NextResponse.json({
                error: 'Unauthorized',
                timestamp
            }, { status: 401 });
        }

        // 콘텐츠 데이터 조회 (처리 상태 포함)
        const { data: content, error: contentError } = await supabase
            .from('contents')
            .select('id, title, processing_status, created_at')
            .eq('id', contentId)
            .single();

        if (contentError) {
            console.error('Error fetching content:', contentError);
            return NextResponse.json({
                isReady: false,
                error: contentError.message,
                timestamp
            }, { status: 404 });
        }

        // 콘텐츠 처리 상태 확인
        const processingStatus = content?.processing_status || 'pending';
        const isProcessingComplete = processingStatus === 'completed';

        // 그룹 데이터 조회
        const { data: groups, error: groupsError } = await supabase
            .from('content_groups')
            .select('id')
            .eq('content_id', contentId);

        if (groupsError) {
            console.error('Error fetching groups:', groupsError);
            return NextResponse.json({
                isReady: false,
                error: groupsError.message,
                timestamp
            }, { status: 404 });
        }

        // 그룹이 있는지만 간단히 확인 (속도 향상을 위해)
        if (!groups || groups.length === 0) {
            return NextResponse.json({
                isReady: false,
                contentExists: !!content,
                groupsCount: 0,
                totalChunksCount: 0,
                processingStatus,
                currentStage: determineCurrentStage(content, [], false),
                title: content?.title || null,
                isProcessingComplete,
                reason: 'Groups not created yet',
                timestamp
            });
        }

        // 청크 존재 여부만 간단히 확인 (첫 번째 그룹에 대해서만)
        const { count, error: chunksCountError } = await supabase
            .from('content_chunks')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groups[0].id)
            .limit(1);

        if (chunksCountError) {
            console.error('Error checking chunks:', chunksCountError);
        }

        const chunksExist = count && count > 0;

        // 준비 상태: 콘텐츠가 있고, 그룹이 있으며, 청크가 존재하고, 처리가 완료되었는지
        // 단순화된 준비 상태 확인 - 처리 상태가 completed이면 준비 완료로 간주
        const isReady = !!content && isProcessingComplete;

        // 모든 그룹의 청크 수 계산 (선택적)
        let totalChunksCount = 0;
        if (chunksExist) {
            const { count: totalCount, error: totalCountError } = await supabase
                .from('content_chunks')
                .select('id', { count: 'exact', head: true })
                .in('group_id', groups.map(g => g.id));

            if (!totalCountError) {
                totalChunksCount = totalCount || 0;
            }
        }

        // 현재 처리 단계 결정
        const currentStage = determineCurrentStage(content, groups, !!chunksExist);

        return NextResponse.json({
            isReady,
            contentExists: !!content,
            groupsCount: groups.length,
            totalChunksCount,
            processingStatus,
            currentStage,
            title: content?.title || null,
            isProcessingComplete,
            chunksExist,
            contentCreatedAt: content?.created_at,
            timestamp, // 타임스탬프 추가
            reason: !isReady ? (
                !content ? 'Content missing' :
                    groups.length === 0 ? 'No groups' :
                        !chunksExist ? 'No chunks' :
                            !isProcessingComplete ? 'Processing not complete' :
                                'Unknown reason'
            ) : 'Data is ready'
        });
    } catch (error) {
        console.error('Unexpected error in check-content API:', error);
        return NextResponse.json({
            isReady: false,
            error: 'Internal server error',
            details: error instanceof Error ? error.message : String(error),
            timestamp: Date.now() // 오류 응답에도 타임스탬프 추가
        }, { status: 500 });
    }
}