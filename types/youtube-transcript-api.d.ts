declare module 'youtube-transcript-api' {
    interface TranscriptItem {
        text: string;
        duration: number;
        offset: number;
        start?: number;
    }

    interface TranscriptOptions {
        languages?: string[];
        callback?: (error: Error | null, result: TranscriptItem[]) => void;
    }

    // 이전 API 버전 (정적 메서드)
    export class YouTubeTranscriptApi {
        static getTranscript(videoId: string, options?: TranscriptOptions): Promise<TranscriptItem[]>;
        static fetchTranscript(videoId: string, options?: TranscriptOptions): Promise<TranscriptItem[]>;
    }

    // 최신 API 버전 (인스턴스 기반)
    export interface FetchedTranscriptSnippet {
        text: string;
        start: number;
        duration: number;
    }

    export interface FetchOptions {
        languages?: string[];
        preserve_formatting?: boolean;
    }

    export interface FetchedTranscript {
        snippets: FetchedTranscriptSnippet[];
        video_id: string;
        language: string;
        language_code: string;
        is_generated: boolean;
        to_raw_data(): TranscriptItem[];
    }

    export interface Transcript {
        video_id: string;
        language: string;
        language_code: string;
        is_generated: boolean;
        is_translatable: boolean;
        translation_languages: Array<{ language: string, language_code: string }>;
        fetch(): Promise<FetchedTranscript>;
        translate(language_code: string): Transcript;
    }

    export interface TranscriptList {
        find_transcript(language_codes: string[]): Transcript;
        find_manually_created_transcript(language_codes: string[]): Transcript;
        find_generated_transcript(language_codes: string[]): Transcript;
        [Symbol.iterator](): Iterator<Transcript>;
    }

    export class YouTubeTranscriptApi {
        constructor();
        fetch(videoId: string, options?: FetchOptions): Promise<FetchedTranscript>;
        list(videoId: string): Promise<TranscriptList>;
    }
}
