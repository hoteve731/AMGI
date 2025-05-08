// cloud-functions/process-pipeline/src/audio_processor.ts
import OpenAI from 'openai';
import { SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

// Maximum duration for OpenAI API (1500 seconds = 25 minutes)
const MAX_DURATION_SECONDS = 1500;
// Maximum chunk size in bytes (10MB instead of 20MB to avoid API limitations)
const MAX_CHUNK_SIZE_MB = 10;
const MAX_CHUNK_SIZE_BYTES = MAX_CHUNK_SIZE_MB * 1024 * 1024;

/**
 * 오디오 파일을 트랜스크립션하는 함수
 */
export async function transcribeAudio(
    supabase: SupabaseClient,
    openai: OpenAI,
    fileBuffer: Buffer,
    fileName: string,
    fileType: string,
    language: string = 'English',
    userId: string
): Promise<{ success: boolean; transcription?: string; error?: string }> {
    let tempFiles: string[] = [];

    try {
        console.log(`[AudioProcessor] Starting transcription for file: ${fileName}, size: ${fileBuffer.length} bytes`);

        // 언어에 따른 프롬프트 준비
        let prompt = '';
        if (language !== 'English') {
            prompt = `This is audio in ${language}.`;
        }

        // 임시 파일 경로 생성
        const tempFilePath = path.join(os.tmpdir(), `audio-${uuidv4()}.${fileName.split('.').pop()}`);
        fs.writeFileSync(tempFilePath, fileBuffer);
        tempFiles.push(tempFilePath);

        console.log(`[AudioProcessor] Saved file to temporary location: ${tempFilePath}`);

        // 파일 크기가 MAX_CHUNK_SIZE_BYTES보다 큰 경우 청크로 나누어 처리
        if (fileBuffer.length > MAX_CHUNK_SIZE_BYTES) {
            console.log(`[AudioProcessor] File size (${fileBuffer.length} bytes) exceeds ${MAX_CHUNK_SIZE_MB}MB, processing in chunks`);
            return await processLargeAudioFile(openai, tempFilePath, fileName, language);
        }

        // 작은 파일은 한 번에 처리
        console.log(`[AudioProcessor] Processing file as a single chunk`);
        const fileStream = fs.createReadStream(tempFilePath);

        try {
            const transcription = await openai.audio.transcriptions.create({
                file: fileStream,
                model: "gpt-4o-mini-transcribe",
                response_format: "text",
                prompt: prompt
            });

            // 트랜스크립션 결과 포맷팅
            const formattedText = formatTranscribedText(transcription, fileName, language);
            console.log(`[AudioProcessor] Transcription successful, length: ${formattedText.length} characters`);

            // 성공 결과 반환
            return {
                success: true,
                transcription: formattedText
            };
        } catch (error: any) {
            console.error(`[AudioProcessor] Transcription error:`, error);

            // 파일 길이가 너무 길 경우 청크 처리 시도
            if (error.message && error.message.includes('longer than 1500 seconds')) {
                console.log(`[AudioProcessor] File duration exceeds limit, trying chunk processing`);
                return await processLargeAudioFile(openai, tempFilePath, fileName, language);
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
    openai: OpenAI,
    filePath: string,
    fileName: string,
    language: string
): Promise<{ success: boolean; transcription?: string; error?: string }> {
    const tempChunkFiles: string[] = [];

    try {
        const fileSize = fs.statSync(filePath).size;
        const numChunks = Math.ceil(fileSize / MAX_CHUNK_SIZE_BYTES);

        console.log(`[AudioProcessor] Processing large file in ${numChunks} chunks`);

        // 언어에 따른 프롬프트 준비
        let prompt = '';
        if (language !== 'English') {
            prompt = `This is audio in ${language}.`;
        }

        // 각 청크별 트랜스크립션 결과를 저장할 배열
        const transcriptionParts: string[] = [];

        // 파일을 청크로 나누어 처리
        for (let i = 0; i < numChunks; i++) {
            const start = i * MAX_CHUNK_SIZE_BYTES;
            const end = Math.min((i + 1) * MAX_CHUNK_SIZE_BYTES, fileSize);

            console.log(`[AudioProcessor] Processing chunk ${i + 1}/${numChunks} (bytes ${start}-${end})`);

            // 청크 파일 생성
            const chunkFilePath = path.join(os.tmpdir(), `chunk-${i}-${uuidv4()}.${fileName.split('.').pop()}`);
            const chunkBuffer = Buffer.alloc(end - start);

            const fd = fs.openSync(filePath, 'r');
            fs.readSync(fd, chunkBuffer, 0, end - start, start);
            fs.closeSync(fd);

            fs.writeFileSync(chunkFilePath, chunkBuffer);
            tempChunkFiles.push(chunkFilePath);

            // 청크 트랜스크립션
            const fileStream = fs.createReadStream(chunkFilePath);

            try {
                const chunkTranscription = await openai.audio.transcriptions.create({
                    file: fileStream,
                    model: "gpt-4o-mini-transcribe",
                    response_format: "text",
                    prompt: prompt
                });

                transcriptionParts.push(chunkTranscription);
                console.log(`[AudioProcessor] Chunk ${i + 1}/${numChunks} transcription successful`);
            } catch (chunkError: any) {
                console.error(`[AudioProcessor] Error transcribing chunk ${i + 1}/${numChunks}:`, chunkError);

                // 청크 처리 중 오류가 발생해도 계속 진행
                transcriptionParts.push(`[Transcription error in part ${i + 1}: ${chunkError.message}]`);
            }
        }

        // 모든 청크 트랜스크립션 결과 합치기
        const combinedTranscription = transcriptionParts.join('\n\n');

        // 트랜스크립션 결과 포맷팅
        const formattedText = formatTranscribedText(combinedTranscription, fileName, language);
        console.log(`[AudioProcessor] Combined transcription successful, length: ${formattedText.length} characters`);

        // 임시 청크 파일 정리
        for (const tempFile of tempChunkFiles) {
            try {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            } catch (err) {
                console.error(`[AudioProcessor] Error deleting temp chunk file ${tempFile}:`, err);
            }
        }

        return {
            success: true,
            transcription: formattedText
        };
    } catch (error: any) {
        console.error(`[AudioProcessor] Error in chunk processing:`, error);

        // 임시 청크 파일 정리
        for (const tempFile of tempChunkFiles) {
            try {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            } catch (err) {
                console.error(`[AudioProcessor] Error deleting temp chunk file ${tempFile}:`, err);
            }
        }

        return {
            success: false,
            error: error.message || 'Unknown error during chunk processing'
        };
    }
}

/**
 * 트랜스크립션 텍스트 포맷팅 함수
 */
function formatTranscribedText(text: string, fileName: string, language: string): string {
    const timestamp = new Date().toISOString();
    const header = `# ${fileName} - Audio Transcription\n\n`;
    const metadata = `*Transcribed at: ${timestamp}*\n*Language: ${language}*\n\n`;
    const content = `## Content\n\n${text}\n`;

    return header + metadata + content;
}

/**
 * 오류 메시지 포맷팅 함수
 */
function formatErrorMessage(fileName: string, fileSize: number): string {
    return `
# 파일이 너무 깁니다

죄송합니다. 현재 이 파일은 OpenAI API의 제한으로 인해 처리할 수 없습니다.

## 파일 정보
- **파일 이름**: ${fileName}
- **파일 크기**: ${(fileSize / (1024 * 1024)).toFixed(2)}MB
- **제한 사항**: OpenAI API는 1500초(25분) 이상의 오디오 파일을 한 번에 처리할 수 없습니다.

## 해결 방법
1. 파일을 25분 이하의 작은 조각들로 분할하여 각각 업로드해 주세요.
2. 오디오 편집 프로그램(예: Audacity)을 사용하여 파일을 분할할 수 있습니다.
3. 더 짧은 오디오 파일을 업로드해 주세요.

이 문제는 현재 OpenAI API의 기술적 제한으로 인한 것이며, 추후 개선될 예정입니다.
`;
}
