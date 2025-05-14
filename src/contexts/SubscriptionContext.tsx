'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { getUserSubscriptionStatus } from '@/utils/subscription';
import { useAuth } from './AuthContext';

// 구독 상태를 위한 타입 정의
interface SubscriptionContextType {
    isSubscribed: boolean;
    contentCount: number;
    contentLimit: number;
    isLoading: boolean;
    refreshSubscriptionStatus: () => Promise<void>;
}

// 기본값으로 컨텍스트 생성
const SubscriptionContext = createContext<SubscriptionContextType>({
    isSubscribed: false,
    contentCount: 0,
    contentLimit: 3,
    isLoading: true,
    refreshSubscriptionStatus: async () => { }
});

// 컨텍스트 사용을 위한 훅
export const useSubscription = () => useContext(SubscriptionContext);

// 구독 Provider 컴포넌트
export function SubscriptionProvider({ children }: { children: ReactNode }) {
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [contentCount, setContentCount] = useState(0);
    const [contentLimit, setContentLimit] = useState(3);
    const [isLoading, setIsLoading] = useState(true);
    const { user, session } = useAuth();
    const supabase = createClientComponentClient();

    // 구독 상태 새로고침 함수
    const refreshSubscriptionStatus = async () => {
        try {
            setIsLoading(true);
            console.log('SubscriptionContext: 구독 상태 새로고침 시작');

            // 다양한 방법으로 사용자 ID 가져오기 시도
            let userId: string | undefined;

            // 1. AuthContext에서 user 객체 사용
            if (user?.id) {
                console.log('SubscriptionContext: AuthContext user에서 ID 가져옴', user.id);
                userId = user.id;
            }
            // 2. AuthContext에서 session 객체 사용
            else if (session?.user?.id) {
                console.log('SubscriptionContext: AuthContext session에서 ID 가져옴', session.user.id);
                userId = session.user.id;
            }
            // 3. supabase.auth.getUser() 직접 호출
            else {
                const { data } = await supabase.auth.getUser();
                if (data?.user?.id) {
                    console.log('SubscriptionContext: supabase.auth.getUser()에서 ID 가져옴', data.user.id);
                    userId = data.user.id;
                }
            }

            // 4. 세션에서 직접 가져오기
            if (!userId) {
                const { data: sessionData } = await supabase.auth.getSession();
                console.log('SubscriptionContext: 세션 데이터', sessionData);
                if (sessionData?.session?.user?.id) {
                    console.log('SubscriptionContext: 세션에서 ID 가져옴', sessionData.session.user.id);
                    userId = sessionData.session.user.id;
                }
            }

            // 5. 로컬 스토리지에서 직접 확인 (최후의 수단)
            if (!userId && typeof window !== 'undefined') {
                try {
                    // Supabase v2 스토리지 키
                    const localSession = localStorage.getItem('sb-' + process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, '') + '-auth-token');
                    console.log('SubscriptionContext: 로컬 스토리지 확인', !!localSession);

                    if (localSession) {
                        const parsedSession = JSON.parse(localSession);
                        userId = parsedSession?.user?.id;
                        console.log('SubscriptionContext: 로컬 스토리지에서 ID 가져옴', userId);
                    }
                } catch (e) {
                    console.error('SubscriptionContext: 로컬 스토리지 접근 오류', e);
                }
            }

            // 사용자 ID를 찾지 못한 경우
            if (!userId) {
                console.log('SubscriptionContext: 사용자 ID를 찾을 수 없음, 비구독 상태로 설정');
                setIsSubscribed(false);
                setContentLimit(3);
                return;
            }

            // 구독 상태 가져오기
            console.log('SubscriptionContext: 구독 상태 확인 시작, userId:', userId);
            const subscriptionData = await getUserSubscriptionStatus(userId);
            console.log('SubscriptionContext: 구독 상태 확인 결과', subscriptionData);

            // 상태 업데이트
            setIsSubscribed(subscriptionData.isSubscribed);
            setContentCount(subscriptionData.contentCount || 0);
            setContentLimit(subscriptionData.contentLimit || 3);

        } catch (error) {
            console.error('SubscriptionContext: 구독 상태 확인 중 오류', error);
            setIsSubscribed(false);
        } finally {
            setIsLoading(false);
        }
    };

    // 컴포넌트 마운트 시 및 사용자 변경 시 구독 상태 확인
    useEffect(() => {
        console.log('SubscriptionContext: useEffect 실행, user 변경 감지');
        refreshSubscriptionStatus();
    }, [user?.id]);

    // 컨텍스트 값
    const value = {
        isSubscribed,
        contentCount,
        contentLimit,
        isLoading,
        refreshSubscriptionStatus
    };

    return (
        <SubscriptionContext.Provider value={value}>
            {children}
        </SubscriptionContext.Provider>
    );
}
