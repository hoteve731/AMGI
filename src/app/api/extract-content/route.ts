import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { YoutubeTranscript } from 'youtube-transcript';

// Detect if a URL is a YouTube video
function isYouTubeUrl(url: string): boolean {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})(\S*)?$/;
    return youtubeRegex.test(url);
}

// Extract video ID from YouTube URL
function extractYouTubeVideoId(url: string): string | null {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})(\S*)?$/;
    const match = url.match(youtubeRegex);
    return match ? match[4] : null;
}

// Extract content from a web page using Readability
async function extractWebContent(url: string): Promise<string> {
    try {
        // Fetch the page content
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch page: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();

        // Parse the HTML using JSDOM
        const dom = new JSDOM(html, { url });

        // Use Readability to extract the main content
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (!article) {
            throw new Error('Failed to extract content from the page');
        }

        // Format the extracted content
        const title = article.title || 'Extracted Content';
        const content = article.textContent || '';
        const siteName = article.siteName ? `Source: ${article.siteName}` : '';
        const excerpt = article.excerpt ? `Summary: ${article.excerpt}` : '';

        // Build the formatted text
        let formattedText = `# ${title}\n\n`;

        if (siteName) {
            formattedText += `${siteName}\n\n`;
        }

        if (excerpt) {
            formattedText += `${excerpt}\n\n`;
        }

        formattedText += content;

        return formattedText;
    } catch (error) {
        console.error('Error extracting web content:', error);
        throw new Error('Failed to extract content from the provided URL');
    }
}

// Extract transcript from a YouTube video
async function extractYouTubeTranscript(videoId: string): Promise<string> {
    try {
        // Fetch the transcript
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);

        // Fetch video details using oEmbed (doesn't require API key)
        const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const response = await fetch(oEmbedUrl);

        let title = 'YouTube Video Transcript';
        let author = '';

        if (response.ok) {
            const data = await response.json();
            title = data.title || title;
            author = data.author_name ? `by ${data.author_name}` : '';
        }

        // Combine transcript segments into a single text
        // Group by time to create paragraphs
        const paragraphs: string[] = [];
        let currentParagraph = '';
        let lastTimestamp = 0;

        transcript.forEach((item, index) => {
            // If there's a significant gap between timestamps or every 10 entries, start a new paragraph
            if (item.offset - lastTimestamp > 5000 || index % 10 === 0 && index > 0) {
                if (currentParagraph) {
                    paragraphs.push(currentParagraph.trim());
                    currentParagraph = '';
                }
            }

            currentParagraph += ` ${item.text}`;
            lastTimestamp = item.offset;
        });

        // Add the last paragraph
        if (currentParagraph) {
            paragraphs.push(currentParagraph.trim());
        }

        // Format the transcript with markdown
        const formattedTranscript = paragraphs.join('\n\n');

        return `# ${title} ${author}\n\nSource: YouTube (https://www.youtube.com/watch?v=${videoId})\n\n## Transcript\n\n${formattedTranscript}`;
    } catch (error) {
        console.error('Error extracting YouTube transcript:', error);
        throw new Error('Failed to extract transcript from the YouTube video. The video might not have captions available.');
    }
}

export async function POST(req: Request) {
    const supabase = await createClient();

    try {
        // Check authentication
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            return NextResponse.json(
                { error: '인증되지 않은 사용자입니다.' },
                { status: 401 }
            );
        }

        // Parse request
        const { url } = await req.json();

        if (!url || typeof url !== 'string') {
            return NextResponse.json(
                { error: '유효한 URL을 입력해주세요.' },
                { status: 400 }
            );
        }

        let extractedText = '';

        // Process based on URL type
        if (isYouTubeUrl(url)) {
            const videoId = extractYouTubeVideoId(url);
            if (!videoId) {
                return NextResponse.json(
                    { error: '유효한 YouTube URL이 아닙니다.' },
                    { status: 400 }
                );
            }
            extractedText = await extractYouTubeTranscript(videoId);
        } else {
            extractedText = await extractWebContent(url);
        }

        return NextResponse.json({ text: extractedText });
    } catch (error) {
        console.error('Content extraction error:', error);
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';

        return NextResponse.json(
            { error: `콘텐츠 추출 중 오류: ${errorMessage}` },
            { status: 500 }
        );
    }
}
