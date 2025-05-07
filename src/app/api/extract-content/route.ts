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
    // Try multiple approaches to get the transcript
    // This is necessary because YouTube may block requests from server environments

    // First, log the attempt for debugging
    console.log(`Attempting to extract transcript for video ID: ${videoId}`);

    try {
        // Approach 1: Try with the youtube-transcript package directly
        console.log('Approach 1: Using youtube-transcript package directly');
        try {
            const transcript = await YoutubeTranscript.fetchTranscript(videoId);
            return await formatTranscript(transcript, videoId);
        } catch (directError) {
            console.error('Direct transcript fetch failed:', JSON.stringify(directError));
            // Continue to next approach
        }

        // Approach 2: Try with custom fetch with browser-like headers
        console.log('Approach 2: Using custom fetch with browser headers');
        try {
            // The package internally uses fetch, so we'll implement a similar approach manually
            // First get the transcript list URL
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
            const response = await fetch(videoUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.youtube.com/',
                }
            });

            // Check if we can access the page
            if (!response.ok) {
                console.error(`YouTube page fetch failed with status: ${response.status}`);
                throw new Error(`Failed to access YouTube video page: ${response.status}`);
            }

            // If we got here, we can try the transcript API directly
            // This is a simplified version - in reality, we'd need to parse the page to get the proper parameters
            const transcriptListUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&type=list`;
            const transcriptListResponse = await fetch(transcriptListUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
                }
            });

            if (!transcriptListResponse.ok) {
                console.error(`Transcript list fetch failed with status: ${transcriptListResponse.status}`);
                throw new Error('Failed to fetch transcript list');
            }

            // This is a simplified implementation - we'd need to parse the XML response
            // and then fetch the actual transcript
            throw new Error('Manual transcript extraction not fully implemented');
        } catch (customFetchError) {
            console.error('Custom fetch approach failed:', customFetchError);
            // Continue to next approach
        }

        // Approach 3: Use a proxy service (you would need to set this up)
        console.log('Approach 3: Using proxy service');
        try {
            // Replace with your actual proxy endpoint
            // This could be a Cloudflare Worker or another service that proxies requests to YouTube
            const proxyUrl = process.env.YOUTUBE_PROXY_URL;

            if (!proxyUrl) {
                console.error('YOUTUBE_PROXY_URL environment variable is not configured');
                throw new Error('Proxy URL not configured');
            }

            console.log(`Using proxy URL: ${proxyUrl} for video ID: ${videoId}`);

            // URL 인코딩을 확실히 적용하여 파라미터 전달
            const encodedVideoId = encodeURIComponent(videoId);
            const fullProxyUrl = `${proxyUrl}?videoId=${encodedVideoId}`;

            console.log(`Making request to: ${fullProxyUrl}`);

            const proxyResponse = await fetch(fullProxyUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            if (!proxyResponse.ok) {
                const errorText = await proxyResponse.text();
                console.error(`Proxy request failed with status: ${proxyResponse.status}`, errorText);
                throw new Error(`Proxy request failed with status: ${proxyResponse.status}. Response: ${errorText}`);
            }

            const proxyData = await proxyResponse.json();
            console.log('Received proxy data:', JSON.stringify({
                success: true,
                hasTranscript: !!proxyData.transcript,
                transcriptLength: proxyData.transcript?.length || 0,
                title: proxyData.title,
                author: proxyData.author
            }));

            if (!proxyData.transcript || !Array.isArray(proxyData.transcript)) {
                console.error('Invalid transcript data from proxy:', JSON.stringify(proxyData));
                throw new Error('Invalid transcript data from proxy');
            }

            return await formatTranscript(proxyData.transcript, videoId, proxyData.title, proxyData.author);
        } catch (proxyError) {
            console.error('Proxy approach failed:', proxyError);
            // All approaches failed, throw a comprehensive error
            throw new Error('All transcript extraction methods failed');
        }
    } catch (error) {
        console.error('Error extracting YouTube transcript:', error);
        throw new Error('Failed to extract transcript from the YouTube video. The video might not have captions available, or YouTube may be blocking server-side requests.');
    }
}

// Helper function to format transcript data consistently
async function formatTranscript(
    transcript: Array<{ text: string, offset: number }>,
    videoId: string,
    title: string = 'YouTube Video Transcript',
    author: string = ''
): Promise<string> {
    // Fetch video details using oEmbed if not provided
    return await fetchVideoDetailsAndFormat(transcript, videoId, title, author);
}

// Fetch video details and format the transcript
async function fetchVideoDetailsAndFormat(
    transcript: Array<{ text: string, offset: number }>,
    videoId: string,
    providedTitle?: string,
    providedAuthor?: string
): Promise<string> {
    let title = providedTitle || 'YouTube Video Transcript';
    let author = providedAuthor || '';

    try {
        // Only fetch details if not provided
        if (!providedTitle || !providedAuthor) {
            // Fetch video details using oEmbed (doesn't require API key)
            const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
            const response = await fetch(oEmbedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
                }
            });

            if (response.ok) {
                const data = await response.json();
                title = data.title || title;
                author = data.author_name ? `by ${data.author_name}` : '';
            } else {
                console.warn(`Failed to fetch video details: ${response.status}`);
            }
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
        console.error('Error formatting transcript:', error);

        // If formatting fails, return a basic format with the raw transcript
        const rawText = transcript.map(item => item.text).join(' ');
        return `# YouTube Video (${videoId})\n\nSource: YouTube (https://www.youtube.com/watch?v=${videoId})\n\n## Transcript\n\n${rawText}`;
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
            console.log(`Processing YouTube URL: ${url}`);
            const videoId = extractYouTubeVideoId(url);
            if (!videoId) {
                console.error('Failed to extract videoId from URL:', url);
                return NextResponse.json(
                    { error: '유효한 YouTube URL이 아닙니다.' },
                    { status: 400 }
                );
            }
            console.log(`Extracted videoId: ${videoId}`);

            try {
                extractedText = await extractYouTubeTranscript(videoId);
            } catch (ytError) {
                console.error('YouTube transcript extraction error:', ytError);
                return NextResponse.json(
                    { error: `YouTube 트랜스크립트 추출 실패: ${ytError instanceof Error ? ytError.message : '알 수 없는 오류'}` },
                    { status: 500 }
                );
            }
        } else {
            console.log(`Processing web URL: ${url}`);
            try {
                extractedText = await extractWebContent(url);
            } catch (webError) {
                console.error('Web content extraction error:', webError);
                return NextResponse.json(
                    { error: `웹 콘텐츠 추출 실패: ${webError instanceof Error ? webError.message : '알 수 없는 오류'}` },
                    { status: 500 }
                );
            }
        }

        return NextResponse.json({ text: extractedText });
    } catch (error) {
        console.error('Content extraction error:', error);
        const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';

        return NextResponse.json(
            { error: `URL 처리 오류: ${errorMessage}` },
            { status: 500 }
        );
    }
}
