'use client'

import { useState } from 'react'
import InputSheet from './InputSheet'

export default function InputButton() {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 left-6 right-6 py-3 px-4 bg-white border rounded-lg text-gray-400 text-left hover:bg-gray-50 transition-colors shadow-sm"
            >
                머릿속에 넣고 싶은 아이디어를 붙여넣으세요
            </button>

            <InputSheet
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
            />
        </>
    )
} 