import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

interface WebLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
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
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    // Set mounted state to true when component mounts
    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
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
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: extractedText,
                    language: 'Korean', // Default to Korean, could be made configurable
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || '마크다운 변환에 실패했습니다.');
            }

            const data = await response.json();

            // Close modal and redirect to the new content
            onClose();
            router.push(`/content/${data.content_id}/groups`);
        } catch (error) {
            console.error('마크다운 변환 오류:', error);
            setError(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
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
                                    {extractedText ? '추출된 콘텐츠' : 'Web Link 추출'}
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
                                    <p className="text-gray-600 mb-4">
                                        웹사이트 URL 또는 YouTube 영상 링크를 입력하여 콘텐츠를 추출하세요.
                                    </p>
                                    <div className="relative">
                                        <input
                                            ref={inputRef}
                                            type="url"
                                            value={url}
                                            onChange={handleUrlChange}
                                            onKeyDown={handleKeyDown}
                                            placeholder="https://example.com 또는 https://youtube.com/watch?v=..."
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
                                                콘텐츠 추출 중...
                                            </div>
                                        ) : (
                                            '콘텐츠 추출하기'
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

                                <div className="flex justify-between">
                                    <button
                                        onClick={() => {
                                            setExtractedText(null);
                                            setError(null);
                                        }}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                                    >
                                        다시 입력하기
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
                                                처리 중...
                                            </div>
                                        ) : (
                                            '마크다운으로 변환하기'
                                        )}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Processing steps indicator */}
                        {processingStep && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                                <div className="flex items-center">
                                    <div className="relative flex items-center justify-center">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${processingStep === 'extracting' ? 'bg-[#7969F7] text-white' : 'bg-gray-200 text-gray-500'
                                            }`}>
                                            1
                                        </div>
                                        {processingStep === 'extracting' && (
                                            <div className="absolute -top-1 -right-1 w-3 h-3">
                                                <div className="animate-ping absolute w-full h-full rounded-full bg-[#7969F7] opacity-75"></div>
                                                <div className="relative w-full h-full rounded-full bg-[#7969F7]"></div>
                                            </div>
                                        )}
                                    </div>
                                    <div className={`h-1 w-10 ${processingStep === 'processing' ? 'bg-[#7969F7]' : 'bg-gray-200'}`}></div>
                                    <div className="relative flex items-center justify-center">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${processingStep === 'processing' ? 'bg-[#7969F7] text-white' : 'bg-gray-200 text-gray-500'
                                            }`}>
                                            2
                                        </div>
                                        {processingStep === 'processing' && (
                                            <div className="absolute -top-1 -right-1 w-3 h-3">
                                                <div className="animate-ping absolute w-full h-full rounded-full bg-[#7969F7] opacity-75"></div>
                                                <div className="relative w-full h-full rounded-full bg-[#7969F7]"></div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex text-xs text-gray-500 mt-1">
                                    <div className="w-8 text-center">추출</div>
                                    <div className="w-10"></div>
                                    <div className="w-8 text-center">변환</div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
