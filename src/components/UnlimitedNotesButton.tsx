'use client'

import React from 'react';
import { SparklesIcon } from "@heroicons/react/24/solid";
import { useSubscription } from '@/contexts/SubscriptionContext';

export default function UnlimitedNotesButton() {
    // SubscriptionContext에서 구독 상태 가져오기
    const { isSubscribed, isLoading } = useSubscription();

    // 이미 구독 중이거나 로딩 중인 경우 버튼 숨기기
    if (isSubscribed || isLoading) {
        return null;
    }

    // Function to trigger the subscription modal
    const handleShowSubscriptionModal = () => {
        // Dispatch a custom event that the SideMenu component listens for
        window.dispatchEvent(new Event('showSubscriptionModal'));
    };

    return (
        <button
            onClick={handleShowSubscriptionModal}
            className="flex items-center justify-center gap-1.5 bg-[#6C37F9] hover:bg-[#5C2DE0] text-white py-2.5 px-6 rounded-full font-bold shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.98]"
        >
            <SparklesIcon className="w-5 h-5 text-yellow-300" />
            <span className="text-base">Unlimited notes</span>
        </button>
    );
}