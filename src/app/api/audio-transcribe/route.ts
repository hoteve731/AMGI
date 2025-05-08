import { NextRequest, NextResponse } from 'next/server';
import { AssemblyAI } from 'assemblyai';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';

// 파일 크기 제한 (2GB)
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

// 전역 변수로 트랜스크립션 진행 상황 저장
interface TranscriptionProgress {
    contentId: string;
    progress: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    error?: string;
    language_code?: string;
}

const transcriptionProgress = new Map<string, TranscriptionProgress>();

export async function POST(request: NextRequest) {
    try {
        // Supabase 클라이언트 생성 및 세션 확인
        const supabase = await createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;

        // 폼 데이터 파싱
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const language = (formData.get('language') as string) || 'English';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // 파일 크기 확인
        if (file.size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json({
                error: `File size exceeds the maximum limit of 2GB. Your file is ${(file.size / (1024 * 1024 * 1024)).toFixed(2)}GB.`
            }, { status: 400 });
        }

        // 콘텐츠 ID 생성
        const contentId = uuidv4();

        // 진행 상황 초기화
        transcriptionProgress.set(contentId, {
            contentId,
            progress: 0,
            status: 'pending',
            language_code: undefined
        });

        // 파일 버퍼로 변환
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 파일 크기에 따라 처리 방법 결정
        let result;

        // 클라우드 함수 URL 확인
        const cloudFunctionUrl = process.env.AUDIO_TRANSCRIPTION_FUNCTION_URL;

        if (cloudFunctionUrl) {
            // 클라우드 함수로 처리 (대용량 파일)
            console.log(`Processing audio file with cloud function: ${file.name}, size: ${file.size} bytes`);
            result = await processWithCloudFunction(buffer, file, contentId, language, userId);
        } else {
            // 로컬에서 처리 (소용량 파일)
            console.log(`Processing audio file locally: ${file.name}, size: ${file.size} bytes`);
            result = await processLocally(buffer, file.name, file.type, language);
        }

        // 결과 반환
        return NextResponse.json({
            contentId,
            success: true,
            transcription: result.transcription,
            language_code: result.language_code
        });
    } catch (error: any) {
        console.error('Error in audio transcription:', error);
        return NextResponse.json({ error: error.message || 'Unknown error' }, { status: 500 });
    }
}

/**
 * 클라우드 함수를 사용하여 오디오 파일 처리
 */
async function processWithCloudFunction(
    buffer: Buffer,
    file: File,
    contentId: string,
    language: string,
    userId: string
): Promise<{ transcription: string; language_code?: string }> {
    const cloudFunctionUrl = process.env.AUDIO_TRANSCRIPTION_FUNCTION_URL;
    if (!cloudFunctionUrl) {
        throw new Error('Cloud function URL not configured');
    }

    // 진행 상황 업데이트
    updateProgress(contentId, 10, 'processing');

    // 폼 데이터 생성
    const formData = new FormData();
    const blob = new Blob([buffer], { type: file.type });
    formData.append('file', blob, file.name);
    formData.append('contentId', contentId);
    formData.append('language', language);
    formData.append('userId', userId);

    // 클라우드 함수 호출
    console.log(`Calling cloud function at ${cloudFunctionUrl}`);
    const response = await fetch(cloudFunctionUrl, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Cloud function error: ${response.status} ${errorText}`);
        updateProgress(contentId, 100, 'failed', errorText);
        throw new Error(`Cloud function error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    if (!result.success) {
        updateProgress(contentId, 100, 'failed', result.error);
        throw new Error(result.error || 'Unknown error from cloud function');
    }

    // 진행 상황 업데이트
    updateProgress(contentId, 100, 'completed', undefined, result.language_code);

    return {
        transcription: result.transcription,
        language_code: result.language_code
    };
}

/**
 * 로컬에서 오디오 파일 처리 (작은 파일용)
 */
async function processLocally(
    buffer: Buffer,
    fileName: string,
    fileType: string,
    language: string
): Promise<{ transcription: string; language_code?: string }> {
    // AssemblyAI API 키 확인
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
        throw new Error('AssemblyAI API key not configured');
    }

    // AssemblyAI 클라이언트 초기화
    const assemblyClient = new AssemblyAI({
        apiKey: apiKey
    });

    try {
        console.log(`Processing file locally: ${fileName}, size: ${buffer.length} bytes`);

        // AssemblyAI API 호출
        const params = {
            audio: buffer,
            speech_model: "universal", // 유니버설 모델 사용
            language_detection: true,  // 자동 언어 감지
        };

        const transcript = await assemblyClient.transcripts.transcribe(params);

        if (transcript.status === "error") {
            throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
        }

        // 트랜스크립션 결과 포맷팅
        const transcriptText = transcript.text || '';
        const formattedText = formatTranscribedText(transcriptText, fileName, transcript.language_code || language);

        return {
            transcription: formattedText,
            language_code: transcript.language_code
        };
    } catch (error: any) {
        console.error('Error in local processing:', error);
        throw error;
    }
}

/**
 * 트랜스크립션 진행 상황 업데이트
 */
function updateProgress(
    contentId: string,
    progress: number,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    error?: string,
    language_code?: string
) {
    const currentProgress = transcriptionProgress.get(contentId);
    if (currentProgress) {
        transcriptionProgress.set(contentId, {
            ...currentProgress,
            progress,
            status,
            error,
            language_code
        });
    }
}

/**
 * 진행 상황 조회 API
 */
export async function GET(request: NextRequest) {
    const url = new URL(request.url);
    const contentId = url.searchParams.get('contentId');

    if (!contentId) {
        return NextResponse.json({ error: 'Content ID is required' }, { status: 400 });
    }

    const progress = transcriptionProgress.get(contentId);

    if (!progress) {
        return NextResponse.json({ error: 'Content ID not found' }, { status: 404 });
    }

    return NextResponse.json(progress);
}

/**
 * 트랜스크립션 텍스트 포맷팅 함수
 */
function formatTranscribedText(text: string, fileName: string, language: string): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    return `# Audio Transcription

**Source**: ${fileName}
**Date**: ${timestamp}
**Language**: ${language}

## Transcript

${text}`;
}
