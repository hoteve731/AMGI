import { NextResponse } from 'next/server';

// API 키를 환경 변수로 관리
const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY || '';

// 비디오 메타데이터를 가져오는 함수
async function getVideoMetadata(videoId: string) {
    try {
        console.log(`비디오 메타데이터 가져오기 시작: ${videoId}`);

        // API 문서에 맞게 호출 형식 확인
        console.log(`메타데이터 API 호출 URL: https://api.supadata.ai/v1/youtube/video?id=${videoId}`);

        const response = await fetch(`https://api.supadata.ai/v1/youtube/video?id=${videoId}`, {
            headers: {
                'x-api-key': SUPADATA_API_KEY
            }
        });

        if (!response.ok) {
            console.error(`메타데이터 API 응답 오류: ${response.status}`);
            console.error(`응답 텍스트: ${await response.text()}`);
            return {
                title: 'YouTube Video',
                description: '',
                channel: { name: '' },
                tags: []
            };
        }

        const data = await response.json();
        console.log('메타데이터 응답 데이터:', JSON.stringify(data, null, 2));

        // API 응답 구조 확인
        if (data.id && data.title) {
            console.log('정상적인 메타데이터 응답 형식');
            return {
                title: data.title || 'YouTube Video',
                description: data.description || '',
                channel: {
                    name: data.channel?.name || ''
                },
                tags: data.tags || []
            };
        } else {
            console.error('비정상적인 메타데이터 응답 형식:', data);

            // 다른 형식으로 시도 (전체 URL 사용)
            console.log('전체 URL로 다시 시도');
            const fullUrlResponse = await fetch(`https://api.supadata.ai/v1/youtube/video?id=https://www.youtube.com/watch?v=${videoId}`, {
                headers: {
                    'x-api-key': SUPADATA_API_KEY
                }
            });

            if (fullUrlResponse.ok) {
                const fullUrlData = await fullUrlResponse.json();
                console.log('전체 URL 메타데이터 응답:', JSON.stringify(fullUrlData, null, 2));

                return {
                    title: fullUrlData.title || 'YouTube Video',
                    description: fullUrlData.description || '',
                    channel: {
                        name: fullUrlData.channel?.name || ''
                    },
                    tags: fullUrlData.tags || []
                };
            } else {
                console.error(`전체 URL 메타데이터 API 응답 오류: ${fullUrlResponse.status}`);
                return {
                    title: 'YouTube Video',
                    description: '',
                    channel: { name: '' },
                    tags: []
                };
            }
        }
    } catch (error) {
        console.error('비디오 메타데이터 가져오기 실패:', error);
        return {
            title: 'YouTube Video',
            description: '',
            channel: { name: '' },
            tags: []
        };
    }
}

// 트랜스크립트를 가져오는 함수
async function getTranscript(videoId: string) {
    try {
        console.log(`트랜스크립트 가져오기 시작: ${videoId}`);

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
                    console.log('사용 가능한 트랜스크립트 언어:', availableLanguages);
                }
            }
        } catch (metadataError) {
            console.error('트랜스크립트 언어 목록 가져오기 실패:', metadataError);
        }

        // 429 오류 방지를 위한 지연 함수
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // 영어 트랜스크립트 먼저 시도
        if (availableLanguages.includes('en')) {
            console.log('영어 트랜스크립트 시도');
            await delay(500); // API 요청 사이에 지연 추가

            const enResponse = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v=${videoId}&text=true&lang=en`, {
                headers: {
                    'x-api-key': SUPADATA_API_KEY
                }
            });

            // 영어 트랜스크립트 응답 확인
            if (enResponse.ok) {
                const enData = await enResponse.json();
                console.log('영어 트랜스크립트 응답 데이터:', JSON.stringify(enData, null, 2));

                if (enData.content) {
                    console.log('영어 트랜스크립트 가져오기 성공');
                    return enData.content;
                }
            } else if (enResponse.status === 429) {
                console.error('영어 트랜스크립트 API 요청 제한 도달 (429)');
                // 더 긴 지연 후 다음 언어 시도
                await delay(2000);
            }
        }

        // 한국어 트랜스크립트 시도
        if (availableLanguages.includes('ko')) {
            console.log('한국어 트랜스크립트 시도');
            await delay(500); // API 요청 사이에 지연 추가

            const koResponse = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v=${videoId}&text=true&lang=ko`, {
                headers: {
                    'x-api-key': SUPADATA_API_KEY
                }
            });

            // 한국어 트랜스크립트 응답 확인
            if (koResponse.ok) {
                const koData = await koResponse.json();
                console.log('한국어 트랜스크립트 응답 데이터:', JSON.stringify(koData, null, 2));

                if (koData.content) {
                    console.log('한국어 트랜스크립트 가져오기 성공');
                    return koData.content;
                }
            } else if (koResponse.status === 429) {
                console.error('한국어 트랜스크립트 API 요청 제한 도달 (429)');
                // 더 긴 지연 후 다음 언어 시도
                await delay(2000);
            }
        }

        // 사용 가능한 첫 번째 언어 시도 (en, ko가 아닌 경우)
        for (const lang of availableLanguages) {
            if (lang !== 'en' && lang !== 'ko') {
                console.log(`${lang} 트랜스크립트 시도`);
                await delay(500); // API 요청 사이에 지연 추가

                const langResponse = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v=${videoId}&text=true&lang=${lang}`, {
                    headers: {
                        'x-api-key': SUPADATA_API_KEY
                    }
                });

                if (langResponse.ok) {
                    const langData = await langResponse.json();
                    console.log(`${lang} 트랜스크립트 응답 데이터:`, JSON.stringify(langData, null, 2));

                    if (langData.content) {
                        console.log(`${lang} 트랜스크립트 가져오기 성공`);
                        return langData.content;
                    }
                } else if (langResponse.status === 429) {
                    console.error(`${lang} 트랜스크립트 API 요청 제한 도달 (429)`);
                    await delay(2000);
                }
            }
        }

        // 언어 지정 없이 기본 트랜스크립트 시도
        console.log('언어 지정 없이 기본 트랜스크립트 시도');
        await delay(500); // API 요청 사이에 지연 추가

        const response = await fetch(`https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v=${videoId}&text=true`, {
            headers: {
                'x-api-key': SUPADATA_API_KEY
            }
        });

        if (!response.ok) {
            if (response.status === 429) {
                console.error('트랜스크립트 API 요청 제한 도달 (429)');
                throw new Error('API 요청 제한에 도달했습니다. 잠시 후 다시 시도해주세요.');
            } else {
                console.error(`트랜스크립트 API 응답 오류: ${response.status}`);
                throw new Error(`트랜스크립트 API 응답 오류: ${response.status}`);
            }
        }

        const data = await response.json();
        console.log('기본 트랜스크립트 응답 데이터:', JSON.stringify(data, null, 2));

        if (!data.content) {
            throw new Error('트랜스크립트 내용이 없습니다');
        }

        console.log('트랜스크립트 가져오기 성공');
        return data.content;
    } catch (error) {
        console.error('트랜스크립트 가져오기 실패:', error);
        throw error;
    }
}

export async function GET(request: Request) {
    // URL에서 videoId 파라미터 추출
    const url = new URL(request.url);
    const videoId = url.searchParams.get('videoId');

    if (!videoId) {
        return NextResponse.json(
            { error: 'videoId 파라미터가 필요합니다' },
            { status: 400 }
        );
    }

    try {
        console.log(`YouTube 트랜스크립트 추출 시작: ${videoId}`);

        // 메타데이터 먼저 가져오기
        const metadata = await getVideoMetadata(videoId);
        console.log('메타데이터 가져오기 완료');

        // 메타데이터 가져오기 성공 후 트랜스크립트 가져오기 (순차적으로)
        try {
            const transcriptContent = await getTranscript(videoId);
            console.log('트랜스크립트 가져오기 완료');

            console.log('최종 메타데이터:', JSON.stringify(metadata, null, 2));
            console.log('최종 트랜스크립트 길이:', transcriptContent?.length || 0);

            return NextResponse.json({
                title: metadata.title,
                author: metadata.channel.name,
                description: metadata.description,
                tags: metadata.tags,
                transcript: transcriptContent
            });
        } catch (transcriptError) {
            console.error('트랜스크립트 가져오기 실패:', transcriptError);

            // 트랜스크립트 없이 메타데이터만 반환
            return NextResponse.json({
                title: metadata.title,
                author: metadata.channel.name,
                description: metadata.description,
                tags: metadata.tags,
                transcript: `# ${metadata.title}\n\n## Description\n\n${metadata.description}\n\n*트랜스크립트를 가져올 수 없습니다: API 요청 제한에 도달했거나 트랜스크립트가 없습니다.*`
            });
        }
    } catch (error) {
        console.error('YouTube 트랜스크립트 추출 오류:', error);

        // 오류 메시지 추출
        let errorMessage = '트랜스크립트 추출 중 오류가 발생했습니다';
        if (error instanceof Error) {
            errorMessage = error.message;
            console.error('오류 세부 정보:', error.stack);
        }

        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
