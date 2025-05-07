import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';

interface WebLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// YouTube 비디오 ID 추출 함수
function extractYouTubeVideoId(url: string): string | null {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})(\S*)?$/;
    const match = url.match(youtubeRegex);
    return match ? match[4] : null;
}

export default function WebLinkModal({ isOpen, onClose }: WebLinkModalProps) {
    const [url, setUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [extractedText, setExtractedText] = useState<string | null>(null);
    const [isYouTube, setIsYouTube] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStep, setProcessingStep] = useState<'extracting' | 'processing' | null>(null);
    const [selectedLanguage, setSelectedLanguage] = useState<string>('English');
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const { mutate } = useSWRConfig();

    // Language storage key - same as BottomSheet
    const LANGUAGE_STORAGE_KEY = 'amgi_selected_language';

    // Set mounted state to true when component mounts
    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    // Load saved language from localStorage
    useEffect(() => {
        try {
            const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
            if (savedLanguage) {
                setSelectedLanguage(savedLanguage);
            }
        } catch (error) {
            console.error('언어 설정 불러오기 실패:', error);
        }
    }, []);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }, [isOpen]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setUrl('');
            setError(null);
            setExtractedText(null);
            setIsYouTube(false);
            setProcessingStep(null);
        }
    }, [isOpen]);

    // Handle language change
    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLanguage = e.target.value;
        setSelectedLanguage(newLanguage);
        try {
            localStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage);
        } catch (error) {
            console.error('언어 설정 저장 실패:', error);
        }
    };

    // Detect if URL is from YouTube
    const detectYouTube = (inputUrl: string) => {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})(\S*)?$/;
        return youtubeRegex.test(inputUrl.trim());
    };

    // Handle URL input change
    const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newUrl = e.target.value;
        setUrl(newUrl);
        setIsYouTube(detectYouTube(newUrl));
        setError(null);
    };

    // 클라이언트 측에서 YouTube 트랜스크립트 추출
    const extractYouTubeTranscriptClient = async (videoId: string): Promise<string> => {
        try {
            console.log(`클라이언트에서 YouTube 트랜스크립트 추출 시도: ${videoId}`);

            // 여러 CORS 프록시 옵션 (첫 번째가 실패하면 다음 것 시도)
            const corsProxies = [
                'https://corsproxy.io/?',
                'https://cors-anywhere.herokuapp.com/',
                'https://api.allorigins.win/raw?url='
            ];

            // 비디오 페이지 가져오기 (여러 프록시 시도)
            let videoPageText = '';
            let usedProxy = '';
            let proxySuccess = false;

            for (const proxy of corsProxies) {
                try {
                    const videoPageUrl = `${proxy}${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
                    const videoPageResponse = await fetch(videoPageUrl, {
                        mode: 'cors',
                        headers: {
                            'Origin': window.location.origin
                        }
                    });

                    if (videoPageResponse.ok) {
                        videoPageText = await videoPageResponse.text();
                        usedProxy = proxy;
                        proxySuccess = true;
                        console.log(`프록시 성공: ${proxy}`);
                        break;
                    }
                } catch (e) {
                    console.error(`프록시 실패: ${proxy}`, e);
                }
            }

            if (!proxySuccess) {
                throw new Error('모든 프록시 서비스 접근 실패');
            }

            console.log('비디오 페이지 가져오기 성공');

            // 비디오 제목 추출
            const titleMatch = videoPageText.match(/<title>(.*?)<\/title>/);
            const title = titleMatch ? titleMatch[1].replace(' - YouTube', '') : 'YouTube Video';
            console.log('추출된 제목:', title);

            // 채널명 추출
            const authorMatch = videoPageText.match(/"ownerChannelName":"(.*?)"/);
            const author = authorMatch ? authorMatch[1] : '';
            console.log('추출된 채널명:', author);

            // 비디오 설명 추출 (자막이 없을 경우를 대비)
            const descriptionMatch = videoPageText.match(/"description":{"simpleText":"(.*?)"/);
            let description = '설명 없음';
            if (descriptionMatch && descriptionMatch[1]) {
                description = descriptionMatch[1].replace(/\\n/g, '\n\n').replace(/\\/g, '');
            }

            // 자막 추출 시도 1: 캡션 트랙 데이터 찾기
            let captionTracks = [];
            const captionTracksMatch = videoPageText.match(/"captionTracks":\[(.*?)(?=\])/);

            if (captionTracksMatch && captionTracksMatch[1]) {
                console.log('캡션 트랙 데이터 찾음');
                try {
                    // 직접 캡션 트랙 객체 추출
                    const rawData = captionTracksMatch[1];
                    const trackRegex = /{(.*?)(?=},|$)/g;
                    let trackMatch;

                    while ((trackMatch = trackRegex.exec(rawData + '}')) !== null) {
                        try {
                            // 각 트랙 정보 추출
                            const trackData = trackMatch[0];
                            const baseUrlMatch = trackData.match(/baseUrl":"(.*?)"/);
                            const nameMatch = trackData.match(/name":{"simpleText":"(.*?)"/);
                            const langCodeMatch = trackData.match(/languageCode":"(.*?)"/);
                            const isDefaultMatch = trackData.match(/isDefault":(true|false)/);

                            if (baseUrlMatch) {
                                captionTracks.push({
                                    baseUrl: baseUrlMatch[1].replace(/\\u0026/g, '&'),
                                    name: { simpleText: nameMatch ? nameMatch[1] : 'Unknown' },
                                    languageCode: langCodeMatch ? langCodeMatch[1] : 'en',
                                    isDefault: isDefaultMatch ? isDefaultMatch[1] === 'true' : false
                                });
                            }
                        } catch (trackError) {
                            console.error('개별 트랙 파싱 오류:', trackError);
                        }
                    }

                    console.log(`캡션 트랙 ${captionTracks.length}개 발견`);
                } catch (e) {
                    console.error('캡션 트랙 파싱 오류:', e);
                }
            }

            // 캡션 트랙이 있는 경우
            if (captionTracks.length > 0) {
                console.log('캡션 트랙 사용 시도');
                // 기본 언어 또는 첫 번째 트랙 선택
                const track = captionTracks.find((t: any) => t.isDefault) || captionTracks[0];

                if (track && track.baseUrl) {
                    console.log('선택된 트랙:', track.name?.simpleText || '이름 없음');
                    console.log('트랙 URL:', track.baseUrl);

                    try {
                        // 트랙 URL에서 자막 가져오기 (CORS 프록시 없이 시도)
                        const transcriptResponse = await fetch(track.baseUrl, {
                            mode: 'no-cors' // CORS 오류를 피하기 위한 설정
                        });

                        // no-cors 모드에서는 응답 내용에 접근할 수 없으므로 이 방법은 작동하지 않음
                        // 대신 비디오 설명으로 대체
                        console.log('자막 가져오기 실패, 비디오 설명 사용');
                        return `# ${title} ${author ? `- ${author}` : ''}\n\nSource: YouTube (https://www.youtube.com/watch?v=${videoId})\n\n## Description\n\n${description}\n\n*Note: This video has captions, but they could not be accessed due to browser security restrictions.*`;
                    } catch (e) {
                        console.error('트랜스크립트 가져오기 오류:', e);
                        // 비디오 설명으로 대체
                        return `# ${title} ${author ? `- ${author}` : ''}\n\nSource: YouTube (https://www.youtube.com/watch?v=${videoId})\n\n## Description\n\n${description}\n\n*Note: This video has captions, but they could not be accessed due to browser security restrictions.*`;
                    }
                }
            }

            // 자막을 가져올 수 없는 경우 비디오 설명 사용
            console.log('자막을 가져올 수 없어 비디오 설명 사용');
            return `# ${title} ${author ? `- ${author}` : ''}\n\nSource: YouTube (https://www.youtube.com/watch?v=${videoId})\n\n## Description\n\n${description}\n\n*Note: This video's captions could not be accessed due to browser security restrictions.*`;

        } catch (error) {
            console.error('YouTube 트랜스크립트 추출 오류:', error);
            throw new Error(`YouTube 트랜스크립트 추출 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
        }
    };

    // HTML 엔티티 디코딩 함수
    const decodeHtmlEntities = (text: string): string => {
        const entities: Record<string, string> = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&#x2F;': '/',
            '&#x60;': '`',
            '&#x3D;': '='
        };

        return text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&#x2F;|&#x60;|&#x3D;/g, match => entities[match]);
    };

    // Extract content from URL
    const handleExtract = async () => {
        if (!url.trim()) {
            setError('URL을 입력해주세요.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setProcessingStep('extracting');

        try {
            // YouTube URL인 경우 클라이언트에서 직접 처리
            if (isYouTube) {
                const videoId = extractYouTubeVideoId(url.trim());
                if (!videoId) {
                    throw new Error('유효한 YouTube URL이 아닙니다.');
                }

                try {
                    const transcript = await extractYouTubeTranscriptClient(videoId);
                    setExtractedText(transcript);
                } catch (ytError) {
                    console.error('YouTube 트랜스크립트 추출 오류:', ytError);
                    throw new Error(`YouTube 트랜스크립트 추출 실패: ${ytError instanceof Error ? ytError.message : '알 수 없는 오류'}`);
                }
            } else {
                // 일반 웹 URL은 기존 API 사용
                const response = await fetch('/api/extract-content', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ url: url.trim() }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || '콘텐츠 추출에 실패했습니다.');
                }

                const data = await response.json();
                setExtractedText(data.text);
            }
        } catch (error) {
            console.error('URL 콘텐츠 추출 오류:', error);
            setError(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    // Process extracted text through markdown conversion
    const handleProcess = async () => {
        if (!extractedText) return;

        setIsProcessing(true);
        setProcessingStep('processing');

        try {
            // 임시 콘텐츠 생성 (UI 즉시 업데이트용)
            const tempContentId = `temp-${Date.now()}`;
            const tempContent = {
                id: tempContentId,
                title: 'Processing...',
                status: 'paused',
                created_at: new Date().toISOString(),
                user_id: 'temp',
                original_text: extractedText.substring(0, 100) + (extractedText.length > 100 ? '...' : ''),
                content_groups: []
            };

            // 임시 콘텐츠 로컬 스토리지에 저장
            localStorage.setItem('temp_content', JSON.stringify(tempContent));

            // SWR 캐시 업데이트 (UI 즉시 반영)
            mutate('/api/contents', (data: any) => {
                if (data && Array.isArray(data.contents)) {
                    return {
                        ...data,
                        contents: [tempContent, ...data.contents]
                    };
                }
                return data;
            }, false);

            // API 호출
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: extractedText,
                    language: selectedLanguage,
                }),
            });

            // 응답 처리
            let generateData;
            try {
                const responseText = await response.text();
                try {
                    generateData = JSON.parse(responseText);
                } catch (parseError) {
                    console.error('JSON 파싱 오류:', parseError, '응답:', responseText.substring(0, 100));
                    throw new Error(`응답 파싱 오류: ${responseText.substring(0, 100)}...`);
                }
            } catch (textError) {
                console.error('응답 읽기 오류:', textError);
                // 에러 처리 - contentId는 아직 없음
                setIsProcessing(false);
                setProcessingStep(null);

                // 임시 콘텐츠 제거
                localStorage.removeItem('temp_content');
                mutate('/api/contents'); // 데이터 다시 가져오기

                onClose();
                router.push('/');
                return;
            }

            if (!response.ok) {
                throw new Error(generateData.error || '콘텐츠 생성 요청 실패');
            }

            const contentId = generateData.content_id;
            if (!contentId) {
                throw new Error('생성된 콘텐츠 ID가 없습니다.');
            }

            console.log('콘텐츠 생성 완료, 홈으로 리디렉션:', contentId);

            // 임시 콘텐츠 ID와 실제 콘텐츠 ID 매핑 저장
            localStorage.setItem('real_content_id', contentId);

            // 데이터 다시 가져오기 - 임시 콘텐츠를 실제 콘텐츠로 대체
            mutate('/api/contents');

            // 모달 닫기 및 홈으로 리디렉션
            onClose();
            router.push('/');
        } catch (error) {
            console.error('마크다운 변환 오류:', error);
            setError(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');

            // 임시 콘텐츠 제거
            localStorage.removeItem('temp_content');
            mutate('/api/contents'); // 데이터 다시 가져오기
        } finally {
            setIsProcessing(false);
            setProcessingStep(null);
        }
    };

    // Handle keyboard events
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!extractedText) {
                handleExtract();
            } else {
                handleProcess();
            }
        }
    };

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="bg-white rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center">
                                <Image
                                    src="/images/loopalink.png"
                                    alt="Web Link"
                                    width={40}
                                    height={40}
                                    className="mr-3"
                                />
                                <h3 className="text-xl font-semibold text-gray-800">
                                    {extractedText ? 'Extracted Content' : 'Web Link'}
                                </h3>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                            >
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
                                    <line x1="4" y1="4" x2="16" y2="16" />
                                    <line x1="16" y1="4" x2="4" y2="16" />
                                </svg>
                            </button>
                        </div>

                        {!extractedText ? (
                            <>
                                <div className="mb-4">
                                    <p className="text-gray-700 mb-4">
                                        Paste URL or YouTube link to generate AI notes.
                                    </p>
                                    <div className="relative">
                                        <input
                                            ref={inputRef}
                                            type="url"
                                            value={url}
                                            onChange={handleUrlChange}
                                            onKeyDown={handleKeyDown}
                                            placeholder="https://example.com"
                                            className="w-full p-3 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7969F7] focus:border-transparent"
                                            disabled={isLoading}
                                        />
                                        {isYouTube && (
                                            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                                                <svg className="w-6 h-6 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>
                                    {error && (
                                        <p className="text-red-500 text-sm mt-2">{error}</p>
                                    )}
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        onClick={handleExtract}
                                        disabled={isLoading || !url.trim()}
                                        className={`px-4 py-2 rounded-lg font-medium ${isLoading || !url.trim()
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-[#7969F7] text-white hover:bg-[#6858e6]'
                                            } transition-colors`}
                                    >
                                        {isLoading ? (
                                            <div className="flex items-center">
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                                Extracting...
                                            </div>
                                        ) : (
                                            'Extract Content'
                                        )}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex-grow overflow-auto mb-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
                                    <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                                        {extractedText}
                                    </pre>
                                </div>

                                {error && (
                                    <p className="text-red-500 text-sm mb-4">{error}</p>
                                )}

                                <div className="mb-8 mt-4">
                                    <div className="flex items-center">
                                        <label htmlFor="language-select" className="text-base font-semibold text-gray-700 mr-2">🌐 Note Language</label>
                                        <select
                                            id="language-select"
                                            value={selectedLanguage}
                                            onChange={handleLanguageChange}
                                            className="text-base font-normal border border-gray-400 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#5F4BB6]"
                                        >
                                            <option value="English">English</option>
                                            <option value="Korean">Korean</option>
                                        </select>
                                    </div>
                                    <span className="text-sm font-normal text-gray-500">Note will be generated in this language.</span>
                                </div>

                                <div className="flex justify-between">
                                    <button
                                        onClick={() => {
                                            setExtractedText(null);
                                            setError(null);
                                        }}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleProcess}
                                        disabled={isProcessing}
                                        className={`px-4 py-2 rounded-lg font-medium ${isProcessing
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-[#7969F7] text-white hover:bg-[#6858e6]'
                                            } transition-colors`}
                                    >
                                        {isProcessing ? (
                                            <div className="flex items-center">
                                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                                Processing...
                                            </div>
                                        ) : (
                                            'Generate Note'
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
