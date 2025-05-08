import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';

interface RecordAudioModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function RecordAudioModal({ isOpen, onClose }: RecordAudioModalProps) {
    const [mounted, setMounted] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingStep, setProcessingStep] = useState<'transcribing' | 'processing' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [transcribedText, setTranscribedText] = useState<string | null>(null);
    const [selectedLanguage, setSelectedLanguage] = useState<string>('English');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
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

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setIsRecording(false);
            setRecordingTime(0);
            setAudioBlob(null);
            setError(null);
            setTranscribedText(null);
            setProcessingStep(null);

            // Stop any ongoing recording
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }

            // Clear any running timer
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
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

    // Format recording time (MM:SS)
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Start recording audio
    const startRecording = async () => {
        setError(null);

        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Create media recorder
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            // Set up event handlers
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                // Create audio blob from chunks
                const audioBlob = new Blob(chunksRef.current, { type: 'audio/mp4' });
                setAudioBlob(audioBlob);

                // Stop all tracks in the stream
                stream.getTracks().forEach(track => track.stop());

                // Clear timer
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
            };

            // Start recording
            mediaRecorder.start();
            setIsRecording(true);

            // Start timer
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (error) {
            console.error('Failed to start recording:', error);
            setError('Microphone access denied or not available. Please check your browser permissions.');
        }
    };

    // Stop recording audio
    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    // Transcribe recorded audio
    const transcribeAudio = async () => {
        if (!audioBlob) return;

        setIsProcessing(true);
        setProcessingStep('transcribing');
        setError(null);

        try {
            // Create form data with audio file
            const formData = new FormData();
            formData.append('file', audioBlob, 'recording.mp4');
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
            setTranscribedText(data.text);

        } catch (error) {
            console.error('Audio transcription error:', error);
            setError(error instanceof Error ? error.message : 'An unknown error occurred');
        } finally {
            setIsProcessing(false);
            setProcessingStep(null);
        }
    };

    // Process transcribed text through markdown conversion
    const handleProcess = async () => {
        if (!transcribedText) return;

        setIsProcessing(true);
        setProcessingStep('processing');

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
                                    src="/images/loopaaudio.png"
                                    alt="Record Audio"
                                    width={40}
                                    height={40}
                                    className="mr-3"
                                />
                                <h3 className="text-xl font-semibold text-gray-800">
                                    {transcribedText ? 'Transcribed Audio' : 'Record Audio'}
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
                                            disabled={isRecording || isProcessing}
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
                                        Record audio in {selectedLanguage} to generate AI notes.
                                    </p>

                                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 mb-4">
                                        {isRecording ? (
                                            <div className="text-center">
                                                <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                                                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 9a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                                <p className="text-xl font-bold text-red-500 mb-2">Recording...</p>
                                                <p className="text-2xl font-mono">{formatTime(recordingTime)}</p>
                                            </div>
                                        ) : audioBlob ? (
                                            <div className="text-center">
                                                <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                                <p className="text-lg font-medium text-green-600 mb-2">Recording Complete</p>
                                                <p className="text-gray-600 mb-2">Duration: {formatTime(recordingTime)}</p>
                                                <audio className="mt-2 mb-4" controls src={URL.createObjectURL(audioBlob)} />
                                            </div>
                                        ) : (
                                            <div className="text-center">
                                                <div className="w-20 h-20 bg-[#5F4BB6] rounded-full flex items-center justify-center mx-auto mb-4">
                                                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                                <p className="text-lg font-medium text-[#5F4BB6] mb-2">Ready to Record</p>
                                                <p className="text-gray-600">Click Start Recording to begin</p>
                                            </div>
                                        )}
                                    </div>

                                    {error && (
                                        <p className="text-red-500 text-sm mb-4">{error}</p>
                                    )}
                                </div>

                                <div className="flex justify-between">
                                    {isRecording ? (
                                        <button
                                            onClick={stopRecording}
                                            className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition-colors duration-200"
                                        >
                                            Stop Recording
                                        </button>
                                    ) : audioBlob ? (
                                        <>
                                            <button
                                                onClick={() => {
                                                    setAudioBlob(null);
                                                    setRecordingTime(0);
                                                }}
                                                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                                            >
                                                Record Again
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
                                    ) : (
                                        <button
                                            onClick={startRecording}
                                            className="w-full py-3 bg-[#5F4BB6] hover:bg-[#4A3A9F] text-white font-semibold rounded-xl transition-colors duration-200"
                                        >
                                            Start Recording
                                        </button>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex-grow overflow-auto mb-4 border border-gray-200 rounded-lg p-3 bg-gray-50">
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
