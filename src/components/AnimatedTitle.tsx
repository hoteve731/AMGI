'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

interface AnimatedTitleProps {
    children: React.ReactNode
    className?: string
}

export default function AnimatedTitle({ children, className = "" }: AnimatedTitleProps) {
    const [isVisible, setIsVisible] = useState(false)

    // 컴포넌트 마운트 시 애니메이션 트리거
    useEffect(() => {
        // 약간의 지연 후 애니메이션 시작
        const timer = setTimeout(() => setIsVisible(true), 200);
        return () => {
            clearTimeout(timer);
            setIsVisible(false);
        }
    }, []);

    return (
        <motion.h3
            className={`text-2xl font-semibold text-black ${className}`}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 15 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1.0] }}
        >
            {children}
        </motion.h3>
    )
}
