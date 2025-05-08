import { NextRequest, NextResponse } from 'next/server';

// 전역 변수로 트랜스크립션 진행 상황 저장 (audio-transcribe/route.ts와 공유)
interface TranscriptionProgress {
    contentId: string;
    progress: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    error?: string;
    language_code?: string;
}

// 이 맵은 audio-transcribe/route.ts에 정의된 것과 동일한 참조를 사용해야 합니다.
// 하지만 서버리스 환경에서는 각 인스턴스가 독립적으로 실행되므로 실제로는 공유되지 않을 수 있습니다.
// 프로덕션 환경에서는 Redis나 데이터베이스를 사용하여 상태를 공유하는 것이 좋습니다.
declare global {
    var transcriptionProgressMap: Map<string, TranscriptionProgress>;
}

// 전역 맵 초기화
if (!global.transcriptionProgressMap) {
    global.transcriptionProgressMap = new Map<string, TranscriptionProgress>();
}

export async function GET(request: NextRequest) {
    try {
        // URL에서 pollingId 파라미터 추출
        const url = new URL(request.url);
        const pollingId = url.searchParams.get('pollingId');

        if (!pollingId) {
            return NextResponse.json(
                { error: 'Missing pollingId parameter' },
                { status: 400 }
            );
        }

        // 진행 상황 조회
        const progress = global.transcriptionProgressMap.get(pollingId);

        if (!progress) {
            return NextResponse.json(
                { error: 'No progress data found for the given ID' },
                { status: 404 }
            );
        }

        // 진행 상황 반환
        return NextResponse.json(progress);
    } catch (error: any) {
        console.error('Error in transcription progress API:', error);
        return NextResponse.json(
            { error: error.message || 'An unknown error occurred' },
            { status: 500 }
        );
    }
}
