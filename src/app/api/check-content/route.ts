import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// 현재 처리 단계 결정 함수
function determineCurrentStage(content: any, hasGroup: boolean, chunksExist: boolean) {
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
            return hasGroup && chunksExist ? 'completed' : 'chunk_generation';
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

        // 단일 그룹 데이터 조회 (간소화된 로직)
        const { data: group, error: groupError } = await supabase
            .from('content_groups')
            .select('id')
            .eq('content_id', contentId)
            .single();

        // 그룹이 없는 경우
        if (groupError || !group) {
            return NextResponse.json({
                isReady: false,
                contentExists: !!content,
                groupsCount: 0,
                totalChunksCount: 0,
                processingStatus,
                currentStage: determineCurrentStage(content, false, false),
                title: content?.title || null,
                isProcessingComplete,
                reason: 'Group not created yet',
                timestamp
            });
        }

        // 청크 존재 여부 및 개수 확인
        const { count: chunksCount, error: chunksCountError } = await supabase
            .from('content_chunks')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', group.id);

        if (chunksCountError) {
            console.error('Error checking chunks:', chunksCountError);
        }

        // 명시적으로 boolean 타입으로 변환
        const chunksExist = !!(chunksCount && chunksCount > 0);
        const totalChunksCount = chunksCount || 0;

        // 준비 상태: 콘텐츠가 있고, 그룹이 있으며, 청크가 존재하고, 처리가 완료되었는지
        // 단순화된 준비 상태 확인 - 처리 상태가 completed이면 준비 완료로 간주
        const isReady = !!content && isProcessingComplete;

        // 현재 처리 단계 결정
        const currentStage = determineCurrentStage(content, !!group, chunksExist);

        return NextResponse.json({
            isReady,
            contentExists: !!content,
            groupsCount: 1, // 항상 1개의 그룹
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
                    !group ? 'No group' :
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