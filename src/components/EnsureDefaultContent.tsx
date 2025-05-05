'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useSWRConfig } from 'swr';

export default function EnsureDefaultContent() {
    const [isChecking, setIsChecking] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const supabase = createClientComponentClient();
    const { mutate } = useSWRConfig();

    // 로그인 상태 확인
    useEffect(() => {
        const checkAuthState = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                setIsLoggedIn(!!session);
            } catch (error) {
                console.log('Session check error (non-critical):', error);
                setIsLoggedIn(false);
            }
        };

        checkAuthState();

        // 인증 상태 변경 리스너 등록
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event);
            setIsLoggedIn(!!session);

            // 로그인 시 상태 초기화
            if (event === 'SIGNED_IN') {
                setIsChecking(false);
                setRetryCount(0);
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [supabase.auth]);

    // 기본 콘텐츠 확인 로직
    useEffect(() => {
        // 로그인 상태가 아니면 실행하지 않음
        if (!isLoggedIn) return;

        const checkAndCreateDefaultContent = async () => {
            // 이미 확인 중이면 중복 실행 방지
            if (isChecking) return;

            try {
                setIsChecking(true);

                // 사용자 정보 가져오기 (세션에서 user 추출)
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();

                if (sessionError) {
                    console.error('Error getting session:', sessionError);
                    setIsChecking(false);
                    return;
                }

                const user = session?.user;
                if (!user) {
                    console.log('User not authenticated, skipping default content check');
                    setIsChecking(false);
                    return;
                }

                console.log('Checking default content for user:', user.id);

                // API 호출하여 기본 콘텐츠 확인 및 생성 (사용자 ID 포함)
                console.log('Calling ensure-default-content API for user:', user.id);
                const response = await fetch(`/api/ensure-default-content?userId=${user.id}`, {
                    credentials: 'include',
                    headers: {
                        'Cache-Control': 'no-cache'
                    }
                });

                if (!response.ok) {
                    console.error('Failed to ensure default content:', response.status, response.statusText);

                    // 401 또는 403 오류는 인증 문제로 간주
                    if (response.status === 401 || response.status === 403) {
                        console.log('Authentication issue, will try again on next login');
                        setIsChecking(false);
                        return;
                    }

                    // 500 오류는 서버 문제로 간주하고 재시도 로직 추가
                    if (response.status === 500 && retryCount < 3) {
                        console.log(`Server error, retrying (${retryCount + 1}/3)...`);
                        setRetryCount(retryCount + 1);
                        setIsChecking(false);
                        // 1초 후 재시도
                        setTimeout(checkAndCreateDefaultContent, 1000);
                        return;
                    }

                    setIsChecking(false);
                    return;
                }

                const result = await response.json();
                console.log('Default content check result:', result);

                // 확인 완료 표시 (사용자 ID별로 구분)
                const storageKey = `default_content_checked_${user.id}`;
                localStorage.setItem(storageKey, 'true');
                // 콘텐츠 목록 재검증
                mutate('/api/contents');
            } catch (error) {
                console.error('Error ensuring default content:', error);
            } finally {
                // 에러가 발생한 경우에만 여기서 상태 초기화 (재시도 로직에서는 초기화하지 않음)
                if (!retryCount) {
                    setIsChecking(false);
                }
            }
        };

        // 로그인 상태일 때만 실행
        if (isLoggedIn && !isChecking) {
            checkAndCreateDefaultContent();
        }

    }, [isLoggedIn, isChecking, retryCount, supabase.auth]);

    // 이 컴포넌트는 UI를 렌더링하지 않음
    return null;
}