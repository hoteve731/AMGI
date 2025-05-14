// 기존 타입 정의들

// 퀴즈 관련 타입 추가
export type QuizOption = string;

export type QuizQuestion = {
    question: string;
    options: QuizOption[];
    correctAnswer: number;
    explanation: string;
};

export type ContentQuiz = {
    id: string;
    content_id: string;
    quiz_data: QuizQuestion[];
    created_at: string;
    updated_at: string;
}; 