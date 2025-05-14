'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// 퀴즈 타입 정의
export type Quiz = {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
}

type QuizComponentProps = {
    quizzes: Quiz[];
}

export default function QuizComponent({ quizzes }: QuizComponentProps) {
    const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [answered, setAnswered] = useState(false);

    // 현재 퀴즈
    const currentQuiz = quizzes[currentQuizIndex];

    // 선택지 클릭 처리
    const handleOptionClick = (optionIndex: number) => {
        if (answered) return; // 이미 답변한 경우 무시

        setSelectedOption(optionIndex);
        setAnswered(true);
        setIsCorrect(optionIndex === currentQuiz.correctAnswer);
    };

    // 다음 퀴즈로 이동
    const handleNextQuiz = () => {
        if (currentQuizIndex < quizzes.length - 1) {
            setCurrentQuizIndex(prev => prev + 1);
            setSelectedOption(null);
            setIsCorrect(null);
            setAnswered(false);
        }
    };

    // 이전 퀴즈로 이동
    const handlePrevQuiz = () => {
        if (currentQuizIndex > 0) {
            setCurrentQuizIndex(prev => prev - 1);
            setSelectedOption(null);
            setIsCorrect(null);
            setAnswered(false);
        }
    };

    // 선택지 옵션 인덱스를 알파벳으로 변환
    const getOptionLetter = (index: number) => {
        return String.fromCharCode(65 + index); // A, B, C, D
    };

    // 퀴즈가 없는 경우
    if (!quizzes || quizzes.length === 0) {
        return (
            <div className="flex justify-center items-center py-12">
                <p className="text-gray-500">No quizzes available.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center w-full">
            {/* 프로그레스 바 */}
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-6">
                <div
                    className="bg-[#7969F7] h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${((currentQuizIndex + 1) / quizzes.length) * 100}%` }}
                />
            </div>

            <div className="flex justify-between w-full mb-2 px-1">
                <span className="text-sm font-medium text-gray-600">
                    Question {currentQuizIndex + 1} of {quizzes.length}
                </span>
            </div>

            {/* 퀴즈 카드 */}
            <div className="w-full bg-white rounded-lg shadow-md p-6 mb-4">
                {/* 퀴즈 번호 */}
                <p className="text-sm text-gray-500 mb-2">Question {currentQuizIndex + 1}</p>

                {/* 퀴즈 질문 */}
                <h3 className="text-lg font-semibold mb-4">{currentQuiz.question}</h3>

                {/* 선택지 */}
                <div className="space-y-3 mt-4">
                    {currentQuiz.options.map((option, index) => (
                        <div
                            key={index}
                            onClick={() => handleOptionClick(index)}
                            className={`
                p-3 rounded-lg border cursor-pointer transition-all duration-200
                ${selectedOption === index
                                    ? (isCorrect
                                        ? 'bg-green-100 border-green-500'
                                        : 'bg-red-100 border-red-500')
                                    : 'border-gray-200 hover:border-[#7969F7] hover:bg-gray-50'}
                ${answered && currentQuiz.correctAnswer === index && 'bg-green-100 border-green-500'}
              `}
                        >
                            <div className="flex items-center">
                                <div className={`
                  w-6 h-6 flex items-center justify-center rounded-full mr-3 font-medium
                  ${selectedOption === index
                                        ? (isCorrect
                                            ? 'bg-green-500 text-white'
                                            : 'bg-red-500 text-white')
                                        : 'bg-gray-200 text-gray-700'}
                  ${answered && currentQuiz.correctAnswer === index && 'bg-green-500 text-white'}
                `}>
                                    {getOptionLetter(index)}
                                </div>
                                <span className="flex-1">{option}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* 설명 */}
                <AnimatePresence>
                    {answered && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className="mt-4 overflow-hidden"
                        >
                            <div className={`p-3 rounded-lg ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
                                <p className={`text-sm font-medium ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                                    {isCorrect ? '정답입니다!' : '틀렸습니다.'}
                                </p>
                                <p className="text-sm text-gray-700 mt-1">{currentQuiz.explanation}</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* 이전/다음 버튼 */}
            <div className="flex w-full justify-between mt-4">
                <button
                    onClick={handlePrevQuiz}
                    disabled={currentQuizIndex === 0}
                    className={`
            px-4 py-2 rounded-full flex items-center
            ${currentQuizIndex === 0
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-gray-600 hover:bg-gray-100'}
          `}
                >
                    <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Previous
                </button>

                {answered && (
                    <button
                        onClick={handleNextQuiz}
                        disabled={currentQuizIndex === quizzes.length - 1}
                        className={`
              px-4 py-2 rounded-full bg-[#7969F7] text-white flex items-center
              ${currentQuizIndex === quizzes.length - 1
                                ? 'opacity-50 cursor-not-allowed'
                                : 'hover:bg-[#6959E7]'}
            `}
                    >
                        Next
                        <svg className="w-5 h-5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
} 