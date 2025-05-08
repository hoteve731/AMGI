// cloud-functions/process-pipeline/src/audio_processor.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { AssemblyAI } from 'assemblyai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

// Maximum chunk size in bytes (10MB)
const MAX_CHUNK_SIZE_MB = 10;
const MAX_CHUNK_SIZE_BYTES = MAX_CHUNK_SIZE_MB * 1024 * 1024;

/**
 * 오디오 파일을 트랜스크립션하는 함수
 */
export async function transcribeAudio(
    supabase: SupabaseClient,
    fileBuffer: Buffer,
    fileName: string,
    fileType: string,
    language: string = 'English',
    userId: string
): Promise<{ success: boolean; transcription?: string; language_code?: string; error?: string }> {
    let tempFiles: string[] = [];

    try {
        console.log(`[AudioProcessor] Starting transcription for file: ${fileName}, size: ${fileBuffer.length} bytes`);

        // Initialize AssemblyAI client
        const apiKey = process.env.ASSEMBLYAI_API_KEY;
        if (!apiKey) {
            throw new Error("ASSEMBLYAI_API_KEY is not set in environment variables");
        }

        const assemblyClient = new AssemblyAI({
            apiKey: apiKey
        });

        // 임시 파일 경로 생성
        const tempFilePath = path.join(os.tmpdir(), `audio-${uuidv4()}.${fileName.split('.').pop()}`);
        fs.writeFileSync(tempFilePath, fileBuffer);
        tempFiles.push(tempFilePath);

        console.log(`[AudioProcessor] Saved file to temporary location: ${tempFilePath}`);

        // 파일 크기가 MAX_CHUNK_SIZE_BYTES보다 큰 경우 청크로 나누어 처리
        if (fileBuffer.length > MAX_CHUNK_SIZE_BYTES) {
            console.log(`[AudioProcessor] File size (${fileBuffer.length} bytes) exceeds ${MAX_CHUNK_SIZE_MB}MB, processing in chunks`);
            return await processLargeAudioFile(assemblyClient, tempFilePath, fileName, language);
        }

        // 작은 파일은 한 번에 처리
        console.log(`[AudioProcessor] Processing file as a single chunk`);

        try {
            // Prepare AssemblyAI params
            const params = {
                audio: fileBuffer,
                speech_model: "universal", // Use universal model for better accuracy
                language_detection: true,  // Automatically detect language
            };

            // Call AssemblyAI API
            const transcript = await assemblyClient.transcripts.transcribe(params);

            if (transcript.status === "error") {
                throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
            }

            // transcript.text가 없을 경우 빈 문자열 사용
            const transcriptText = transcript.text || '';

            // 트랜스크립션 결과 포맷팅
            const formattedText = formatTranscribedText(transcriptText, fileName, transcript.language_code || language);
            console.log(`[AudioProcessor] Transcription successful, length: ${formattedText.length} characters, language: ${transcript.language_code}`);

            // 성공 결과 반환
            return {
                success: true,
                transcription: formattedText,
                language_code: transcript.language_code
            };
        } catch (error: any) {
            console.error(`[AudioProcessor] Transcription error:`, error);

            // 파일 크기가 큰 경우 청크 처리 시도
            if (error.message && (error.message.includes('file too large') || error.message.includes('size limit'))) {
                console.log(`[AudioProcessor] File size exceeds limit, trying chunk processing`);
                return await processLargeAudioFile(assemblyClient, tempFilePath, fileName, language);
            }

            throw error; // 다른 오류는 상위로 전달
        }
    } catch (error: any) {
        console.error(`[AudioProcessor] Error processing audio:`, error);
        return {
            success: false,
            error: error.message || 'Unknown error during audio processing'
        };
    } finally {
        // 임시 파일 정리
        for (const tempFile of tempFiles) {
            try {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                    console.log(`[AudioProcessor] Deleted temporary file: ${tempFile}`);
                }
            } catch (err) {
                console.error(`[AudioProcessor] Error deleting temp file ${tempFile}:`, err);
            }
        }
    }
}

/**
 * 큰 오디오 파일을 청크로 나누어 처리하는 함수
 */
async function processLargeAudioFile(
    assemblyClient: AssemblyAI,
    filePath: string,
    fileName: string,
    language: string
): Promise<{ success: boolean; transcription?: string; language_code?: string; error?: string }> {
    console.log(`[AudioProcessor] Starting large file processing for ${fileName}`);

    try {
        const fileSize = fs.statSync(filePath).size;
        const chunkSize = MAX_CHUNK_SIZE_BYTES;
        const totalChunks = Math.ceil(fileSize / chunkSize);

        console.log(`[AudioProcessor] File size: ${fileSize} bytes, will be processed in ${totalChunks} chunks`);

        let allTranscriptions: string[] = [];
        let detectedLanguage: string | undefined;

        // 각 청크를 순차적으로 처리
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, fileSize);
            const chunkBuffer = Buffer.alloc(end - start);

            // 파일에서 청크 읽기
            const fileHandle = await fs.promises.open(filePath, 'r');
            await fileHandle.read(chunkBuffer, 0, end - start, start);
            await fileHandle.close();

            console.log(`[AudioProcessor] Processing chunk ${i + 1}/${totalChunks}, size: ${chunkBuffer.length} bytes`);

            // Prepare AssemblyAI params
            const params = {
                audio: chunkBuffer,
                speech_model: "universal", // Use universal model for better accuracy
                language_detection: i === 0, // Only detect language in first chunk
            };

            // Call AssemblyAI API
            const transcript = await assemblyClient.transcripts.transcribe(params);

            if (transcript.status === "error") {
                throw new Error(`AssemblyAI transcription failed for chunk ${i + 1}: ${transcript.error}`);
            }

            // 첫 번째 청크에서 감지된 언어 저장
            if (i === 0 && transcript.language_code) {
                detectedLanguage = transcript.language_code;
                console.log(`[AudioProcessor] Detected language: ${detectedLanguage}`);
            }

            // transcript.text가 없을 경우 빈 문자열 사용
            const transcriptText = transcript.text || '';

            allTranscriptions.push(transcriptText);
            console.log(`[AudioProcessor] Chunk ${i + 1} transcription completed, length: ${transcriptText.length} characters`);
        }

        // 모든 트랜스크립션 결합
        const combinedText = allTranscriptions.join(' ');

        // 결합된 텍스트 포맷팅
        const formattedText = formatTranscribedText(combinedText, fileName, detectedLanguage || language);
        console.log(`[AudioProcessor] All chunks processed successfully, total length: ${formattedText.length} characters`);

        return {
            success: true,
            transcription: formattedText,
            language_code: detectedLanguage
        };
    } catch (error: any) {
        console.error(`[AudioProcessor] Error processing large file:`, error);
        return {
            success: false,
            error: error.message || 'Unknown error during large file processing'
        };
    }
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

/**
 * 오류 메시지 포맷팅 함수
 */
function formatErrorMessage(fileName: string, fileSize: number): string {
    return `
# 파일 처리 오류

죄송합니다. 현재 이 파일을 처리할 수 없습니다.

## 파일 정보
- **파일 이름**: ${fileName}
- **파일 크기**: ${(fileSize / (1024 * 1024)).toFixed(2)}MB

## 해결 방법
1. 파일을 더 작은 조각들로 분할하여 각각 업로드해 주세요.
2. 오디오 편집 프로그램(예: Audacity)을 사용하여 파일을 분할할 수 있습니다.
3. 더 짧은 오디오 파일을 업로드해 주세요.
`;
}
