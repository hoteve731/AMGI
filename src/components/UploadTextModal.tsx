'use client'

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';

interface UploadTextModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function UploadTextModal({ isOpen, onClose }: UploadTextModalProps) {
    const [text, setText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState<string>('English');
    const router = useRouter();
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { mutate } = useSWRConfig();

    // Constants for text length validation
    const MIN_LENGTH = 50;
    const MAX_LENGTH = 20000;

    // Language storage key - same as BottomSheet
    const LANGUAGE_STORAGE_KEY = 'amgi_selected_language';

    // Computed properties for text validation
    const textLength = text.length;
    const isLengthUnderMin = textLength > 0 && textLength < MIN_LENGTH;
    const isLengthOverMax = textLength > MAX_LENGTH;
    const isLengthValid = textLength >= MIN_LENGTH && textLength <= MAX_LENGTH;

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

    // Focus textarea when modal opens
    useEffect(() => {
        if (isOpen && textareaRef.current) {
            setTimeout(() => {
                textareaRef.current?.focus();
            }, 100);
        }
    }, [isOpen]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setText('');
            setError(null);
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

    // Get counter text color based on text length
    const getCounterColor = () => {
        if (isLengthUnderMin) return 'text-yellow-600'; // 최소 미만일 때 노란색 경고
        if (isLengthOverMax) return 'text-red-600'; // 최대 초과일 때 빨간색 경고
        return 'text-gray-500'; // 유효 범위일 때 회색
    };

    // Get counter text based on text length
    const getCounterText = () => {
        if (textLength === 0) return `${MAX_LENGTH} characters allowed`;
        if (isLengthUnderMin) return `${MIN_LENGTH} characters minimum. (${textLength}/${MAX_LENGTH})`;
        if (isLengthOverMax) return `Character limit exceeded (${textLength}/${MAX_LENGTH})`;
        return `${textLength}/${MAX_LENGTH}`;
    };

    // Process text through markdown conversion
    const handleProcess = async () => {
        if (!text.trim() || !isLengthValid) {
            setError(isLengthUnderMin
                ? `Text must be at least ${MIN_LENGTH} characters.`
                : isLengthOverMax
                    ? `Text cannot exceed ${MAX_LENGTH} characters.`
                    : 'Please enter some text.');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // 임시 콘텐츠 생성 (UI 즉시 업데이트용)
            const tempContentId = `temp-${Date.now()}`;
            const tempContent = {
                id: tempContentId,
                title: 'Processing...',
                status: 'paused',
                created_at: new Date().toISOString(),
                user_id: 'temp',
                original_text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
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
                    text,
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
                setIsLoading(false);
                setError('응답 처리 중 오류가 발생했습니다.');

                // 임시 콘텐츠 제거
                localStorage.removeItem('temp_content');
                mutate('/api/contents'); // 데이터 다시 가져오기

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
            setIsLoading(false);
        }
    };

    // Handle keyboard events
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            handleProcess();
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
                        className="bg-white rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center">
                                <Image
                                    src="/images/loopadocs.png"
                                    alt="Upload Text"
                                    width={40}
                                    height={40}
                                    className="mr-3"
                                />
                                <h3 className="text-xl font-semibold text-gray-800">
                                    Upload Text
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

                        <div className="mb-4 flex-shrink-0">
                            <p className="text-gray-700 mb-4">
                                Enter your text to generate AI notes.
                            </p>
                            <div className="flex-grow overflow-auto mb-4">
                                <textarea
                                    ref={textareaRef}
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Write or paste text..."
                                    className={`w-full p-3 border ${isLengthOverMax ? 'border-red-300' : 'border-gray-200'} rounded-lg resize-none focus:outline-none focus:border-[#7969F7] ${isLengthOverMax ? 'focus:border-red-500' : ''} min-h-[250px]`}
                                    disabled={isLoading}
                                />
                                <div className={`text-right text-xs mt-1.5 ${getCounterColor()}`}>
                                    {getCounterText()}
                                </div>
                            </div>
                            {error && (
                                <p className="text-red-500 text-sm mb-4">{error}</p>
                            )}
                        </div>

                        <div className="flex items-center mb-6 flex-shrink-0">
                            <label className="text-gray-700 mr-3">Language:</label>
                            <select
                                value={selectedLanguage}
                                onChange={handleLanguageChange}
                                className="border border-gray-200 rounded-lg p-2 text-gray-700 focus:outline-none focus:border-[#7969F7]"
                                disabled={isLoading}
                            >
                                <option value="English">English</option>
                                <option value="Korean">한국어</option>
                            </select>
                        </div>

                        <div className="flex justify-end pb-1 flex-shrink-0">
                            <button
                                onClick={handleProcess}
                                disabled={isLoading || !text.trim() || !isLengthValid}
                                className={`px-4 py-2 rounded-lg font-medium ${isLoading || !text.trim() || !isLengthValid
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-[#7969F7] text-white hover:bg-[#6858e6]'
                                    } transition-colors`}
                            >
                                {isLoading ? (
                                    <div className="flex items-center">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                        Processing...
                                    </div>
                                ) : (
                                    'Process'
                                )}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}