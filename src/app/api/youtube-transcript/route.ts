import { NextResponse } from 'next/server';

// API 키를 환경 변수로 관리
const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY || '';

// 비디오 메타데이터를 가져오는 함수
async function getVideoMetadata(videoId: string) {
    try {
        console.log(`Starting to fetch video metadata: ${videoId}`);

        // API 문서에 맞게 호출 형식 확인
        console.log(`Metadata API call URL: https://api.supadata.ai/v1/youtube/video?id=${videoId}`);

        const response = await fetch(`https://api.supadata.ai/v1/youtube/video?id=${videoId}`, {
            headers: {
                'x-api-key': SUPADATA_API_KEY
            }
        });

        if (!response.ok) {
            console.error(`Metadata API response error: ${response.status}`);
            console.error(`Response text: ${await response.text()}`);
            return {
                title: 'YouTube Video',
                channel: { name: '' }
            };
        }

        const data = await response.json();
        console.log('Metadata response data:', JSON.stringify(data, null, 2));

        // API 응답 구조 확인
        if (data.id && data.title) {
            console.log('Valid metadata response format');
            return {
                title: data.title || 'YouTube Video',
                channel: {
                    name: data.channel?.name || ''
                }
            };
        } else {
            console.error('Invalid metadata response format:', data);

            // 다른 형식으로 시도 (전체 URL 사용)
            console.log('Trying with full URL');
            const fullUrlResponse = await fetch(`https://api.supadata.ai/v1/youtube/video?id=https://www.youtube.com/watch?v=${videoId}`, {
                headers: {
                    'x-api-key': SUPADATA_API_KEY
                }
            });

            if (fullUrlResponse.ok) {
                const fullUrlData = await fullUrlResponse.json();
                console.log('Full URL metadata response:', JSON.stringify(fullUrlData, null, 2));

                return {
                    title: fullUrlData.title || 'YouTube Video',
                    channel: {
                        name: fullUrlData.channel?.name || ''
                    }
                };
            } else {
                console.error(`Full URL metadata API response error: ${fullUrlResponse.status}`);
                return {
                    title: 'YouTube Video',
                    channel: { name: '' }
                };
            }
        }
    } catch (error) {
        console.error('Failed to fetch video metadata:', error);
        return {
            title: 'YouTube Video',
            channel: { name: '' }
        };
    }
}

// 트랜스크립트를 가져오는 함수
async function getTranscript(videoId: string) {
    try {
        console.log(`Starting to fetch transcript: ${videoId}`);

        // 메타데이터에서 사용 가능한 언어 확인
        let availableLanguages = [];
        try {
            const metadataResponse = await fetch(`https://api.supadata.ai/v1/youtube/video?id=${videoId}`, {
                headers: {
                    'x-api-key': SUPADATA_API_KEY
                }
            });

            if (metadataResponse.ok) {
                const metadataData = await metadataResponse.json();
                if (metadataData.transcriptLanguages && Array.isArray(metadataData.transcriptLanguages)) {
                    availableLanguages = metadataData.transcriptLanguages;
                    console.log('Available transcript languages:', availableLanguages);
                }
            }
        } catch (metadataError) {
            console.error('Failed to fetch transcript language list:', metadataError);
        }

        // 429 오류 방지를 위한 지연 함수
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // 영어 트랜스크립트 먼저 시도
        if (availableLanguages.includes('en')) {
            console.log('Trying English transcript');
            await delay(500); // API 요청 사이에 지연 추가

            const enResponse = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v=${videoId}&text=true&lang=en`, {
                headers: {
                    'x-api-key': SUPADATA_API_KEY
                }
            });

            // 영어 트랜스크립트 응답 확인
            if (enResponse.ok) {
                const enData = await enResponse.json();
                console.log('English transcript response data:', JSON.stringify(enData, null, 2));

                if (enData.content) {
                    console.log('Successfully fetched English transcript');
                    return enData.content;
                }
            } else if (enResponse.status === 429) {
                console.error('English transcript API rate limit reached (429)');
                // 더 긴 지연 후 다음 언어 시도
                await delay(2000);
            }
        }

        // 한국어 트랜스크립트 시도
        if (availableLanguages.includes('ko')) {
            console.log('Trying Korean transcript');
            await delay(500); // API 요청 사이에 지연 추가

            const koResponse = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v=${videoId}&text=true&lang=ko`, {
                headers: {
                    'x-api-key': SUPADATA_API_KEY
                }
            });

            // 한국어 트랜스크립트 응답 확인
            if (koResponse.ok) {
                const koData = await koResponse.json();
                console.log('Korean transcript response data:', JSON.stringify(koData, null, 2));

                if (koData.content) {
                    console.log('Successfully fetched Korean transcript');
                    return koData.content;
                }
            } else if (koResponse.status === 429) {
                console.error('Korean transcript API rate limit reached (429)');
                // 더 긴 지연 후 다음 언어 시도
                await delay(2000);
            }
        }

        // 사용 가능한 첫 번째 언어 시도 (en, ko가 아닌 경우)
        for (const lang of availableLanguages) {
            if (lang !== 'en' && lang !== 'ko') {
                console.log(`Trying ${lang} transcript`);
                await delay(500); // API 요청 사이에 지연 추가

                const langResponse = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v=${videoId}&text=true&lang=${lang}`, {
                    headers: {
                        'x-api-key': SUPADATA_API_KEY
                    }
                });

                if (langResponse.ok) {
                    const langData = await langResponse.json();
                    console.log(`${lang} transcript response data:`, JSON.stringify(langData, null, 2));

                    if (langData.content) {
                        console.log(`Successfully fetched ${lang} transcript`);
                        return langData.content;
                    }
                } else if (langResponse.status === 429) {
                    console.error(`${lang} transcript API rate limit reached (429)`);
                    await delay(2000);
                }
            }
        }

        // 언어 지정 없이 기본 트랜스크립트 시도
        console.log('Trying default transcript without language specification');
        await delay(500); // API 요청 사이에 지연 추가

        const response = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v=${videoId}&text=true`, {
            headers: {
                'x-api-key': SUPADATA_API_KEY
            }
        });

        if (!response.ok) {
            if (response.status === 429) {
                console.error('Transcript API rate limit reached (429)');
                throw new Error('Too many requests! Please try again in 5 seconds.');
            } else {
                console.error(`Transcript API response error: ${response.status}`);
                throw new Error(`Transcript API response error: ${response.status}`);
            }
        }

        const data = await response.json();
        console.log('Default transcript response data:', JSON.stringify(data, null, 2));

        if (!data.content) {
            throw new Error('No transcript content available');
        }

        console.log('Successfully fetched transcript');
        return data.content;
    } catch (error) {
        console.error('Failed to fetch transcript:', error);
        throw error;
    }
}

export async function GET(request: Request) {
    // URL에서 videoId 파라미터 추출
    const url = new URL(request.url);
    const videoId = url.searchParams.get('videoId');

    if (!videoId) {
        return NextResponse.json(
            { error: 'videoId parameter is required' },
            { status: 400 }
        );
    }

    try {
        console.log(`Starting YouTube transcript extraction: ${videoId}`);

        // 메타데이터 먼저 가져오기
        const metadata = await getVideoMetadata(videoId);
        console.log('Metadata fetching completed');

        // 메타데이터 가져오기 성공 후 트랜스크립트 가져오기 (순차적으로)
        try {
            const transcriptContent = await getTranscript(videoId);
            console.log('Transcript fetching completed');

            console.log('Final metadata:', JSON.stringify(metadata, null, 2));
            console.log('Final transcript length:', transcriptContent?.length || 0);

            return NextResponse.json({
                title: metadata.title,
                author: metadata.channel.name,
                transcript: transcriptContent
            });
        } catch (transcriptError) {
            console.error('Failed to fetch transcript:', transcriptError);

            // 트랜스크립트 없이 메타데이터만 반환
            return NextResponse.json({
                title: metadata.title,
                author: metadata.channel.name,
                transcript: `# ${metadata.title}\n\n*No transcript available: API rate limit reached or no transcript exists for this video. Please try again in 5 seconds.*`
            });
        }
    } catch (error) {
        console.error('YouTube transcript extraction error:', error);

        // 오류 메시지 추출
        let errorMessage = 'An error occurred while extracting transcript';
        if (error instanceof Error) {
            errorMessage = error.message;
            console.error('Error details:', error.stack);
        }

        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
