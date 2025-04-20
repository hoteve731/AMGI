'use client'

import { useEffect, useState } from 'react'

export default function UpdatePrompt() {
    const [showReload, setShowReload] = useState(false)

    useEffect(() => {
        if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data.type === 'UPDATE_AVAILABLE') {
                    setShowReload(true)
                }
            });

            navigator.serviceWorker.register('/service-worker.js').then(registration => {
                console.log('Service Worker registered:', registration);
            }).catch(error => {
                console.error('Service Worker registration failed:', error);
            });
        }
    }, []);

    const handleUpdate = () => {
        window.location.reload();
    };

    if (!showReload) return null;

    return (
        <div className="fixed bottom-4 left-4 right-4 bg-white p-4 rounded-lg shadow-lg flex items-center justify-between z-50">
            <p className="text-sm">새로운 버전이 있습니다.</p>
            <button
                onClick={handleUpdate}
                className="bg-[#8B5CF6] text-white px-4 py-2 rounded-md text-sm"
            >
                업데이트
            </button>
        </div>
    );
} 