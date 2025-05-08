import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';

// Define global type for TypeScript
declare global {
    var transcriptionProgress: {
        [key: string]: {
            progress: number;
            message: string;
            status: string;
            text?: string; // Optional text field for completed transcriptions
        }
    };
}

// Initialize global progress tracking if not exists
if (!global.transcriptionProgress) {
    global.transcriptionProgress = {};
}

// Maximum allowed upload size (75MB)
const MAX_UPLOAD_SIZE = 75 * 1024 * 1024;

// Cloud function URL - 배포된 URL로 업데이트 필요
// 현재는 임시로 로컬 API 처리 방식으로 돌아가도록 설정
const CLOUD_FUNCTION_URL = process.env.AUDIO_TRANSCRIPTION_FUNCTION_URL || '';
const USE_LOCAL_PROCESSING = !CLOUD_FUNCTION_URL; // 클라우드 함수 URL이 없으면 로컬 처리

export async function POST(req: Request) {
    const supabase = await createClient();

    try {
        // Check authentication
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            return NextResponse.json(
                { error: 'Unauthenticated user' },
                { status: 401 }
            );
        }

        const userId = session.user.id;

        // Parse form data
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const language = formData.get('language') as string || 'English';

        // Validate file
        if (!file) {
            return NextResponse.json(
                { error: 'No audio file provided' },
                { status: 400 }
            );
        }

        // Check file size
        if (file.size > MAX_UPLOAD_SIZE) {
            return NextResponse.json(
                { error: 'File size exceeds the 75MB limit' },
                { status: 400 }
            );
        }

        // Check file type
        const validTypes = ['audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/m4a', 'video/mp4'];
        const fileType = file.type;
        const fileName = file.name;

        if (!validTypes.includes(fileType) &&
            !fileName.endsWith('.mp3') &&
            !fileName.endsWith('.mp4') &&
            !fileName.endsWith('.wav') &&
            !fileName.endsWith('.webm') &&
            !fileName.endsWith('.m4a')) {
            return NextResponse.json(
                { error: 'Invalid file type. Supported formats: MP3, MP4, WAV, WebM, M4A' },
                { status: 400 }
            );
        }

        console.log(`Starting audio transcription for file: ${fileName}, size: ${file.size}, type: ${fileType}`);

        // Create a unique ID for tracking progress
        const progressId = uuidv4();

        // Initialize progress
        global.transcriptionProgress[progressId] = {
            progress: 0,
            message: 'Starting transcription...',
            status: 'processing'
        };

        // Return polling ID immediately so client can start polling
        const response = NextResponse.json({
            pollingId: progressId
        });

        // Process in background
        (async () => {
            try {
                // Update progress
                global.transcriptionProgress[progressId] = {
                    progress: 10,
                    message: 'Processing audio file...',
                    status: 'processing'
                };

                // 클라우드 함수 URL이 있고 사용 가능한 경우
                if (CLOUD_FUNCTION_URL && !USE_LOCAL_PROCESSING) {
                    try {
                        // Create a new FormData for the cloud function
                        const cloudFormData = new FormData();
                        cloudFormData.append('file', file);
                        cloudFormData.append('language', language);
                        cloudFormData.append('userId', userId);
                        cloudFormData.append('contentId', progressId);

                        // Call the cloud function
                        console.log(`Calling cloud function for file: ${fileName}`);
                        const cloudResponse = await fetch(CLOUD_FUNCTION_URL, {
                            method: 'POST',
                            body: cloudFormData
                        });

                        if (!cloudResponse.ok) {
                            throw new Error(`Cloud function error: ${cloudResponse.status} ${cloudResponse.statusText}`);
                        }

                        // 응답이 JSON인지 확인
                        const contentType = cloudResponse.headers.get('content-type');
                        if (!contentType || !contentType.includes('application/json')) {
                            const text = await cloudResponse.text();
                            throw new Error(`Invalid response format: ${contentType}. Response: ${text.substring(0, 100)}...`);
                        }

                        const result = await cloudResponse.json();

                        if (!result.success) {
                            throw new Error(result.error || 'Transcription failed');
                        }

                        // Update progress to completed
                        global.transcriptionProgress[progressId] = {
                            progress: 100,
                            message: 'Transcription completed',
                            status: 'completed',
                            text: result.transcription
                        };

                        console.log(`Transcription completed for ${fileName}, length: ${result.transcription.length}`);
                        return;
                    } catch (cloudError: any) {
                        console.error('Cloud function error:', cloudError);
                        // 클라우드 함수 오류 발생 시 로컬 처리로 폴백
                        console.log('Falling back to local processing...');
                    }
                }

                // 로컬 처리 로직 - OpenAI 클라이언트 초기화
                const openai = new OpenAI({
                    apiKey: process.env.OPENAI_API_KEY,
                    baseURL: "https://api.openai.com/v1"
                });

                // 언어에 따른 프롬프트 준비
                let prompt = '';
                if (language !== 'English') {
                    prompt = `This is audio in ${language}.`;
                }

                // 진행상황 업데이트
                global.transcriptionProgress[progressId] = {
                    progress: 30,
                    message: 'Transcribing with OpenAI...',
                    status: 'processing'
                };

                // OpenAI API로 트랜스크립션 시도
                try {
                    const transcription = await openai.audio.transcriptions.create({
                        file: file,
                        model: "gpt-4o-mini-transcribe",
                        response_format: "text",
                        prompt: prompt
                    });

                    // 트랜스크립션 결과 포맷팅
                    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                    const formattedText = `# Audio Transcription

**Source**: ${fileName}
**Date**: ${timestamp}
**Language**: ${language}

## Transcript

${transcription}`;

                    // 진행상황 업데이트
                    global.transcriptionProgress[progressId] = {
                        progress: 100,
                        message: 'Transcription completed',
                        status: 'completed',
                        text: formattedText
                    };

                    console.log(`Transcription completed for ${fileName}, length: ${formattedText.length}`);
                } catch (openaiError: any) {
                    console.error('OpenAI API error:', openaiError);

                    // 파일이 너무 긴 경우 사용자에게 안내 메시지 제공
                    if (openaiError.message && openaiError.message.includes('longer than 1500 seconds')) {
                        const errorMessage = `

# 파일이 너무 깁니다

죄송합니다. 현재 이 파일은 OpenAI API의 제한으로 인해 처리할 수 없습니다.

## 파일 정보
- **파일 이름**: ${fileName}
- **파일 크기**: ${(file.size / (1024 * 1024)).toFixed(2)}MB
- **제한 사항**: OpenAI API는 1500초(25분) 이상의 오디오 파일을 한 번에 처리할 수 없습니다.

## 해결 방법
1. 파일을 25분 이하의 작은 조각들로 분할하여 각각 업로드해 주세요.
2. 오디오 편집 프로그램(예: Audacity)을 사용하여 파일을 분할할 수 있습니다.
3. 더 짧은 오디오 파일을 업로드해 주세요.

이 문제는 현재 OpenAI API의 기술적 제한으로 인한 것이며, 추후 개선될 예정입니다.
`;

                        global.transcriptionProgress[progressId] = {
                            progress: 100,
                            message: 'File is too large to process',
                            status: 'completed',
                            text: errorMessage
                        };
                    } else {
                        // 다른 오류 처리
                        global.transcriptionProgress[progressId] = {
                            progress: 0,
                            message: `Error: ${openaiError.message || 'Unknown error'}`,
                            status: 'error'
                        };
                    }
                }
            } catch (error: any) {
                console.error('Transcription error:', error);

                // Update progress to error
                global.transcriptionProgress[progressId] = {
                    progress: 0,
                    message: `Error: ${error.message || 'Unknown error'}`,
                    status: 'error'
                };
            }
        })();

        return response;
    } catch (error: any) {
        console.error('Audio transcription error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `Server error: ${errorMessage}` },
            { status: 500 }
        );
    }
}

// 클라우드 함수에서 처리하므로 더 이상 필요하지 않음
