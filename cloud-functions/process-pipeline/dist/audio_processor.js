"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeAudio = transcribeAudio;
const assemblyai_1 = require("assemblyai");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const uuid_1 = require("uuid");
// 파일 크기 제한 (2GB)
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
// 오디오 길이 제한 (10시간 = 36000초)
const MAX_AUDIO_DURATION_SECONDS = 10 * 60 * 60;
/**
 * 오디오 파일을 트랜스크립션하는 함수
 */
async function transcribeAudio(supabase, fileBuffer, fileName, fileType, language = 'English', userId) {
    let tempFiles = [];
    try {
        console.log(`[AudioProcessor] Starting transcription for file: ${fileName}, size: ${fileBuffer.length} bytes`);
        // 파일 크기 확인
        if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
            return {
                success: false,
                error: `File size exceeds the maximum limit of 2GB. Your file is ${(fileBuffer.length / (1024 * 1024 * 1024)).toFixed(2)}GB.`
            };
        }
        // Initialize AssemblyAI client
        const apiKey = process.env.ASSEMBLYAI_API_KEY;
        if (!apiKey) {
            throw new Error("ASSEMBLYAI_API_KEY is not set in environment variables");
        }
        const assemblyClient = new assemblyai_1.AssemblyAI({
            apiKey: apiKey
        });
        // 임시 파일 경로 생성
        const tempFilePath = path_1.default.join(os_1.default.tmpdir(), `audio-${(0, uuid_1.v4)()}.${fileName.split('.').pop()}`);
        fs_1.default.writeFileSync(tempFilePath, fileBuffer);
        tempFiles.push(tempFilePath);
        console.log(`[AudioProcessor] Saved file to temporary location: ${tempFilePath}`);
        try {
            // According to the AssemblyAI documentation, we can pass a local file path directly
            const params = {
                audio: tempFilePath,
                language_detection: true
            };
            // Call AssemblyAI API
            console.log(`[AudioProcessor] Calling AssemblyAI transcribe API with params:`, JSON.stringify(params));
            const transcript = await assemblyClient.transcripts.transcribe(params);
            if (transcript.status === "error") {
                throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
            }
            // 오디오 길이 확인 (초 단위)
            if (transcript.audio_duration && transcript.audio_duration > MAX_AUDIO_DURATION_SECONDS) {
                return {
                    success: false,
                    error: `Audio duration exceeds the maximum limit of 10 hours. Your audio is ${(transcript.audio_duration / 3600).toFixed(2)} hours.`
                };
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
        }
        catch (error) {
            console.error(`[AudioProcessor] Transcription error:`, error);
            throw error; // 오류를 상위로 전달
        }
    }
    catch (error) {
        console.error(`[AudioProcessor] Error processing audio:`, error);
        return {
            success: false,
            error: error.message || 'Unknown error during audio processing'
        };
    }
    finally {
        // 임시 파일 정리
        for (const tempFile of tempFiles) {
            try {
                if (fs_1.default.existsSync(tempFile)) {
                    fs_1.default.unlinkSync(tempFile);
                    console.log(`[AudioProcessor] Deleted temporary file: ${tempFile}`);
                }
            }
            catch (err) {
                console.error(`[AudioProcessor] Error deleting temp file ${tempFile}:`, err);
            }
        }
    }
}
/**
 * 트랜스크립션 텍스트 포맷팅 함수
 */
function formatTranscribedText(text, fileName, language) {
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
function formatErrorMessage(fileName, fileSize) {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    return `# Audio Transcription Error

**Source**: ${fileName}
**Date**: ${timestamp}
**File Size**: ${fileSizeMB} MB

## Error

The audio file could not be transcribed due to an error. The file may be too large or in an unsupported format.

Please try with a smaller audio file (under 2GB) or a different format.`;
}
