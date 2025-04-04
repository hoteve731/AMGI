'use client'

import { motion } from 'framer-motion'

export default function LoadingOverlay() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white/40 backdrop-blur-sm z-[80] flex items-center justify-center"
        >
            <div className="relative w-10 h-10">
                {[0, 1, 2, 3, 4].map((i) => (
                    <motion.div
                        key={i}
                        className="absolute w-2 h-2 bg-[#7969F7] rounded-full"
                        style={{
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                        }}
                        animate={{
                            x: [
                                '0px',
                                `${Math.cos(i * (2 * Math.PI / 5)) * 16}px`,
                                '0px'
                            ],
                            y: [
                                '0px',
                                `${Math.sin(i * (2 * Math.PI / 5)) * 16}px`,
                                '0px'
                            ],
                        }}
                        transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            delay: i * 0.1,
                            ease: [0.4, 0, 0.2, 1],
                            times: [0, 0.5, 1]
                        }}
                    />
                ))}
            </div>
        </motion.div>
    )
} 