import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Define global type for TypeScript
declare global {
    var transcriptionProgress: {
        [key: string]: {
            progress: number;
            message: string;
            status: string;
            text?: string; // Optional text field for completed transcriptions
            language_code?: string; // Added language code field for AssemblyAI
        }
    };
}

export async function GET(request: Request) {
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

        // Get progress ID from query parameter
        const { searchParams } = new URL(request.url);
        const progressId = searchParams.get('id');

        if (!progressId) {
            return NextResponse.json(
                { error: 'Missing progress ID' },
                { status: 400 }
            );
        }

        // Initialize global progress tracking object if it doesn't exist
        global.transcriptionProgress = global.transcriptionProgress || {};

        // Get progress data
        const progressData = global.transcriptionProgress[progressId] || {
            progress: 0,
            message: '진행 정보를 찾을 수 없습니다',
            status: 'unknown'
        };

        return NextResponse.json(progressData);
    } catch (error) {
        console.error('Error fetching transcription progress:', error);
        return NextResponse.json(
            { error: 'Failed to fetch progress' },
            { status: 500 }
        );
    }
}
