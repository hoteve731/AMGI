import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { AssemblyAI } from 'assemblyai';

// Define global type for TypeScript
declare global {
    var transcriptionProgress: {
        [key: string]: {
            progress: number;
            message: string;
            status: string;
            text?: string; // Optional text field for completed transcriptions
            language_code?: string; // Added language code field
        }
    };
}

// Initialize global progress tracking if not exists
if (!global.transcriptionProgress) {
    global.transcriptionProgress = {};
}

// Maximum allowed upload size (75MB)
const MAX_UPLOAD_SIZE = 75 * 1024 * 1024;

// Cloud function URL - 로컬에서 실행 중인 클라우드 함수 사용
// 8080 포트에서 실행 중인 로컬 클라우드 함수 사용
const CLOUD_FUNCTION_URL = process.env.AUDIO_TRANSCRIPTION_FUNCTION_URL || 'http://localhost:8080/processAudioTranscription';
const USE_LOCAL_PROCESSING = true; // 로컬 처리 사용 (AssemblyAI API)

// Initialize AssemblyAI client with API key from environment variables
const assemblyClient = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY
});

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
                    console.log(`Using cloud function for transcription: ${CLOUD_FUNCTION_URL}`);
                    try {
                        // Create a new FormData for the cloud function
                        const cloudFormData = new FormData();

                        // 파일 데이터 추가 - 파일명 명시적 지정
                        cloudFormData.append('file', file, fileName);

                        // 메타데이터 추가
                        cloudFormData.append('language', language);
                        cloudFormData.append('userId', userId);
                        cloudFormData.append('contentId', progressId);

                        console.log(`Calling cloud function with: language=${language}, userId=${userId}, contentId=${progressId}`);

                        // Call the cloud function
                        console.log(`Calling cloud function for file: ${fileName}, size: ${file.size} bytes`);
                        const cloudResponse = await fetch(CLOUD_FUNCTION_URL, {
                            method: 'POST',
                            body: cloudFormData,
                            // Content-Type 헤더를 명시적으로 설정하지 않음 (브라우저가 자동으로 boundary 설정)
                        });

                        if (!cloudResponse.ok) {
                            const errorText = await cloudResponse.text();
                            console.error(`Cloud function error: ${cloudResponse.status} ${cloudResponse.statusText}. Response: ${errorText}`);
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
                        throw cloudError;
                    }
                } else {
                    console.log(`Using AssemblyAI for transcription`);

                    // 진행상황 업데이트
                    global.transcriptionProgress[progressId] = {
                        progress: 30,
                        message: 'Transcribing with AssemblyAI...',
                        status: 'processing'
                    };

                    try {
                        // Convert File to ArrayBuffer
                        const arrayBuffer = await file.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);

                        // Prepare AssemblyAI params
                        const params = {
                            audio: buffer,
                            speech_model: "universal", // Use universal model for better accuracy
                            language_detection: true,  // Automatically detect language
                        };

                        // Update progress
                        global.transcriptionProgress[progressId] = {
                            progress: 50,
                            message: 'Uploading and processing with AssemblyAI...',
                            status: 'processing'
                        };

                        // Call AssemblyAI API
                        const transcript = await assemblyClient.transcripts.transcribe(params);

                        if (transcript.status === "error") {
                            throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
                        }

                        // Update progress to completed
                        global.transcriptionProgress[progressId] = {
                            progress: 100,
                            message: 'Transcription completed',
                            status: 'completed',
                            text: transcript.text,
                            language_code: transcript.language_code
                        };

                        console.log(`AssemblyAI transcription completed for ${fileName}, language: ${transcript.language_code}`);
                        return;
                    } catch (assemblyError: any) {
                        console.error('AssemblyAI error:', assemblyError);

                        // Update progress to error
                        global.transcriptionProgress[progressId] = {
                            progress: 0,
                            message: `AssemblyAI error: ${assemblyError.message || 'Unknown error'}`,
                            status: 'error'
                        };

                        throw assemblyError;
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
        console.error('Request handling error:', error);
        return NextResponse.json(
            { error: error.message || 'An unknown error occurred' },
            { status: 500 }
        );
    }
}
