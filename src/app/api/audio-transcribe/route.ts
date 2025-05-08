import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://api.openai.com/v1"
});

// Maximum file size (25MB)
const MAX_FILE_SIZE = 25 * 1024 * 1024;

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
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: 'File size exceeds the 25MB limit' },
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

        // Prepare prompt based on language
        let prompt = '';
        if (language !== 'English') {
            prompt = `This is audio in ${language}.`;
        }

        // Transcribe audio using OpenAI
        const transcription = await openai.audio.transcriptions.create({
            file: file,
            model: "gpt-4o-mini-transcribe",
            response_format: "text",
            prompt: prompt
        });

        console.log(`Transcription complete. Text length: ${transcription.length}`);

        // Format the transcribed text
        const formattedText = formatTranscribedText(transcription, fileName, language);

        return NextResponse.json({
            text: formattedText
        });

    } catch (error) {
        console.error('Audio transcription error:', error);

        // Handle OpenAI API errors
        if (error instanceof OpenAI.APIError) {
            const status = error.status || 500;
            const message = error.message || 'OpenAI API error';

            return NextResponse.json(
                { error: `Transcription error: ${message}` },
                { status }
            );
        }

        // Handle other errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `Server error: ${errorMessage}` },
            { status: 500 }
        );
    }
}

// Format transcribed text with metadata
function formatTranscribedText(text: string, fileName: string, language: string): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    return `# Audio Transcription

**Source**: ${fileName}
**Date**: ${timestamp}
**Language**: ${language}

## Transcript

${text}`;
}
