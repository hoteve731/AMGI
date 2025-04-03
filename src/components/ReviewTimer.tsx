'use client';

import { useState, useEffect } from 'react';

interface ReviewTimerProps {
    nextReviewDate: Date;
    onTimeUp: () => void;
}

export function ReviewTimer({ nextReviewDate, onTimeUp }: ReviewTimerProps) {
    const [timeLeft, setTimeLeft] = useState<string>('');

    useEffect(() => {
        const calculateTimeLeft = () => {
            const now = new Date().getTime();
            const target = new Date(nextReviewDate).getTime();
            const difference = target - now;

            if (difference <= 0) {
                onTimeUp();
                return '시간이 되었습니다';
            }

            const hours = Math.floor(difference / (1000 * 60 * 60));
            const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((difference % (1000 * 60)) / 1000);

            return `${hours}시간 ${minutes}분 ${seconds}초`;
        };

        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearInterval(timer);
    }, [nextReviewDate, onTimeUp]);

    return (
        <div className="text-lg font-medium">
            다음 복습까지: {timeLeft}
        </div>
    );
} 