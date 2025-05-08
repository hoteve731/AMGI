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
        
        // OpenAI API에 전송할 파일 생성
        const fileStream = fs.createReadStream(tempFilePath);
        
        // 트랜스크립션 시도
        console.log(`[AudioProcessor] Attempting transcription with model: gpt-4o-mini-transcribe`);
        
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
            
            // 파일 길이가 너무 길 경우 사용자에게 안내 메시지 제공
            if (error.message && error.message.includes('longer than 1500 seconds')) {
                const errorMessage = formatErrorMessage(fileName, fileBuffer.length);
                return { 
                    success: false, 
                    error: 'File duration exceeds limit',
                    transcription: errorMessage
                };
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
