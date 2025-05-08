import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import useSWR from 'swr';

interface UploadAudioModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function UploadAudioModal({ isOpen, onClose }: UploadAudioModalProps) {
    const [mounted, setMounted] = useState(false);
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStep, setProcessingStep] = useState<'transcribing' | 'processing' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [transcribedText, setTranscribedText] = useState<string | null>(null);
    const [selectedLanguage, setSelectedLanguage] = useState<string>('English');
    const [isDragging, setIsDragging] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [pollingId, setPollingId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
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
            console.error('Failed to load language setting:', error);
        }
    }, []);

    // Reset state when modal opens or closes
    useEffect(() => {
        if (isOpen) {
            // Reset state when modal opens
            setIsProcessing(false);
            setProcessingStep(null);
            // Don't reset other states when opening to preserve previous selections
        } else {
            // Reset all states when modal closes
            setAudioFile(null);
            setError(null);
            setTranscribedText(null);
            setProcessingStep(null);
            setIsDragging(false);
            setProgress(0);
            setProgressMessage('');
            setPollingId(null);
            setIsProcessing(false);
        }
    }, [isOpen]);

    // Handle language change
    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLanguage = e.target.value;
        setSelectedLanguage(newLanguage);
        try {
            localStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage);
        } catch (error) {
            console.error('Failed to save language setting:', error);
        }
    };

    // Handle file input change
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleFileSelection(files[0]);
        }
    };

    // Handle file selection
    const handleFileSelection = (file: File) => {
        setError(null);

        // Check file type
        const validTypes = ['audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/m4a', 'video/mp4'];
        if (!validTypes.includes(file.type) &&
            !file.name.endsWith('.mp3') &&
            !file.name.endsWith('.mp4') &&
            !file.name.endsWith('.wav') &&
            !file.name.endsWith('.webm') &&
            !file.name.endsWith('.m4a')) {
            setError('Please upload a valid audio file (MP3, MP4, WAV, WebM, M4A)');
            return;
        }

        // Check file size (25MB limit)
        if (file.size > 75 * 1024 * 1024) {
            setError('File size exceeds 75MB limit');
            return;
        }

        setAudioFile(file);
    };

    // Handle drag events
    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFileSelection(files[0]);
        }
    };

    // Trigger file input click
    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    // Format file size
    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' bytes';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    // Transcribe uploaded audio
    const transcribeAudio = async () => {
        if (!audioFile) return;

        setIsProcessing(true);
        setProcessingStep('transcribing');
        setError(null);
        setProgress(0);
        setProgressMessage('Transcribing audio...');

        try {
            // Create form data with audio file
            const formData = new FormData();
            formData.append('file', audioFile);
            formData.append('language', selectedLanguage);

            // Send to transcription API
            const response = await fetch('/api/audio-transcribe', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to transcribe audio');
            }

            const data = await response.json();

            // 즉시 응답이 있는 경우
            if (data.transcription) {
                setTranscribedText(data.transcription);
                setIsProcessing(false);
                setProcessingStep(null);
                return;
            }

            // 폴링이 필요한 경우 폴링 ID 설정
            if (data.contentId) {
                setPollingId(data.contentId);
                // 폴링 상태 유지
                setIsProcessing(true);
                setProcessingStep('transcribing');
            } else {
                // 응답이 없는 경우 (오류)
                setIsProcessing(false);
                setProcessingStep(null);
                setError('트랜스크립션 응답이 없습니다.');
            }

        } catch (error) {
            console.error('Audio transcription error:', error);
            setError(error instanceof Error ? error.message : 'An unknown error occurred');
            setIsProcessing(false);
            setProcessingStep(null);
        }
    };

    // Polling for transcription completion
    useSWR(
        pollingId ? `/api/transcription-progress?pollingId=${pollingId}` : null,
        async (url) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch status');
            return res.json();
        },
        {
            refreshInterval: 3000, // 3초마다 확인
            onSuccess: (data) => {
                console.log('Transcription status:', data);

                // 완료 상태일 때만 처리
                if (data && data.status === 'completed') {
                    // 폴링 중단
                    setPollingId(null);
                    setIsProcessing(false);
                    setProcessingStep(null);

                    // 트랜스크립션 텍스트가 있으면 상태로 반영
                    if (data.transcription && typeof data.transcription === 'string') {
                        setTranscribedText(data.transcription);
                    }
                } else if (data && data.status === 'error') {
                    // 오류 발생 시
                    setPollingId(null);
                    setIsProcessing(false);
                    setProcessingStep(null);
                    setError(data.error || '트랜스크립션 처리 중 오류가 발생했습니다.');
                } else if (data && (data.status === 'processing' || data.status === 'in_progress')) {
                    // 진행 중인 경우 진행률 업데이트
                    setProgress(data.progress || 0);
                    setProgressMessage(data.message || 'Processing...');
                }
            }
        }
    );

    // Process transcribed text through markdown conversion
    const handleProcess = async () => {
        if (!transcribedText) return;

        setIsProcessing(true);
        setProcessingStep('processing');
        setProgress(0);
        setProgressMessage('Processing text...');

        try {
            // Create temporary content for immediate UI update
            const tempContentId = `temp-${Date.now()}`;
            const tempContent = {
                id: tempContentId,
                title: 'Processing...',
                status: 'paused',
                created_at: new Date().toISOString(),
                user_id: 'temp',
                original_text: transcribedText.substring(0, 100) + (transcribedText.length > 100 ? '...' : ''),
                content_groups: []
            };

            // Save temporary content to localStorage
            localStorage.setItem('temp_content', JSON.stringify(tempContent));

            // Update SWR cache for immediate UI reflection
            mutate('/api/contents', (data: any) => {
                if (data && Array.isArray(data.contents)) {
                    return {
                        ...data,
                        contents: [tempContent, ...data.contents]
                    };
                }
                return data;
            }, false);

            // Call API to generate markdown
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: transcribedText,
                    language: selectedLanguage,
                }),
            });

            // Process response
            let generateData;
            try {
                const responseText = await response.text();
                try {
                    generateData = JSON.parse(responseText);
                } catch (parseError) {
                    console.error('JSON parsing error:', parseError, 'Response:', responseText.substring(0, 100));
                    throw new Error(`Response parsing error: ${responseText.substring(0, 100)}...`);
                }
            } catch (textError) {
                console.error('Response reading error:', textError);
                // Error handling - no contentId yet
                setIsProcessing(false);
                setProcessingStep(null);

                // Remove temporary content
                localStorage.removeItem('temp_content');
                mutate('/api/contents'); // Refresh data

                onClose();
                router.push('/');
                return;
            }

            if (!response.ok) {
                throw new Error(generateData.error || 'Content generation request failed');
            }

            const contentId = generateData.content_id;
            if (!contentId) {
                throw new Error('No content ID in the generated content');
            }

            console.log('Content generation complete, redirecting to home:', contentId);

            // Save mapping between temporary and real content ID
            localStorage.setItem('real_content_id', contentId);

            // Refresh data - replace temporary content with real content
            mutate('/api/contents');

            // Close modal and redirect to home
            onClose();
            router.push('/');
        } catch (error) {
            console.error('Markdown conversion error:', error);
            setError(error instanceof Error ? error.message : 'An unknown error occurred');

            // Remove temporary content
            localStorage.removeItem('temp_content');
            mutate('/api/contents'); // Refresh data
        } finally {
            setIsProcessing(false);
            setProcessingStep(null);
            setProgress(0);
            setProgressMessage('');
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
                        className="bg-white rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center">
                                <Image
                                    src="/images/loopaaudio.png"
                                    alt="Upload Audio"
                                    width={40}
                                    height={40}
                                    className="mr-3"
                                />
                                <h3 className="text-xl font-semibold text-gray-800">
                                    {transcribedText ? 'Transcribed Audio' : 'Upload Audio'}
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

                        {!transcribedText ? (
                            <>
                                <div className="mb-8">
                                    <div className="flex items-center mb-4">
                                        <label htmlFor="audio-language-select" className="text-base font-semibold text-gray-700 mr-2">🌐 Audio Language</label>
                                        <select
                                            id="audio-language-select"
                                            value={selectedLanguage}
                                            onChange={handleLanguageChange}
                                            className="text-base font-normal border border-gray-400 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#5F4BB6]"
                                            disabled={isProcessing}
                                        >
                                            <option value="English">English</option>
                                            <option value="Korean">Korean</option>
                                            <option value="Japanese">Japanese</option>
                                            <option value="Chinese">Chinese</option>
                                            <option value="Spanish">Spanish</option>
                                            <option value="French">French</option>
                                            <option value="German">German</option>
                                        </select>
                                    </div>
                                    <p className="text-gray-600 mb-6">
                                        Upload audio file in {selectedLanguage} to generate notes.
                                    </p>

                                    <div
                                        className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg bg-gray-50 ${isDragging ? 'border-[#5F4BB6] bg-[#5F4BB6]/10' : 'border-gray-300'
                                            } transition-colors duration-200`}
                                        onDragEnter={handleDragEnter}
                                        onDragLeave={handleDragLeave}
                                        onDragOver={handleDragOver}
                                        onDrop={handleDrop}
                                    >
                                        {audioFile ? (
                                            <div className="text-center">
                                                <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
                                                    <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                                <p className="text-lg font-semibold text-green-600 mb-2">File Selected</p>
                                                <p className="text-gray-600 mb-1">{audioFile.name}</p>
                                                <p className="text-gray-500 text-sm mb-1">{formatFileSize(audioFile.size)}</p>
                                                {audioFile.type.startsWith('audio/') && (
                                                    <audio className="mt-2 mb-1" controls src={URL.createObjectURL(audioFile)} />
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-center">
                                                <div className="w-20 h-20 bg-[#5F4BB6] rounded-full flex items-center justify-center mx-auto mb-4">
                                                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                                <p className="text-lg font-medium text-[#5F4BB6] mb-2">Drag & Drop Audio File</p>
                                                <p className="text-gray-600 mb-4">or</p>
                                                <button
                                                    onClick={triggerFileInput}
                                                    className="px-4 py-2 bg-[#5F4BB6] font-medium text-white rounded-lg hover:bg-[#4A3A9F] transition-colors"
                                                >
                                                    Select Audio File
                                                </button>
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept="audio/*,.mp3,.mp4,.wav,.webm,.m4a"
                                                    onChange={handleFileChange}
                                                    className="hidden"
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {error && (
                                        <p className="text-red-500 text-sm mb-4">{error}</p>
                                    )}
                                    {isProcessing && (
                                        <div className="mt-4 text-center">
                                            <p className="text-sm text-gray-600">
                                                <span className="text-s text-gray-500">Large files may take longer to process. (1 min = 1 second)</span>
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-between">
                                    {audioFile ? (
                                        <>
                                            <button
                                                onClick={() => setAudioFile(null)}
                                                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={transcribeAudio}
                                                disabled={isProcessing}
                                                className={`px-6 py-2 rounded-lg font-medium ${isProcessing
                                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                    : 'bg-[#7969F7] text-white hover:bg-[#6858e6]'
                                                    } transition-colors`}
                                            >
                                                {isProcessing ? (
                                                    <div className="flex items-center">
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                                        Transcribing...
                                                    </div>
                                                ) : (
                                                    'Transcribe Audio'
                                                )}
                                            </button>
                                        </>
                                    ) : null}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex-grow overflow-auto mb-4 border border-gray-200 rounded-lg p-3 bg-gray-50 max-h-[40vh]">
                                    <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                                        {transcribedText}
                                    </pre>
                                </div>

                                {error && (
                                    <p className="text-red-500 text-sm mb-4">{error}</p>
                                )}

                                <div className="mb-8 mt-4">
                                    <div className="flex items-center">
                                        <label htmlFor="note-language-select" className="text-base font-semibold text-gray-700 mr-2">🌐 Note Language</label>
                                        <select
                                            id="note-language-select"
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
                                            setTranscribedText(null);
                                            setError(null);
                                        }}
                                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleProcess}
                                        disabled={isProcessing || !transcribedText}
                                        className={`px-4 py-2 rounded-lg font-medium ${isProcessing || !transcribedText
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
