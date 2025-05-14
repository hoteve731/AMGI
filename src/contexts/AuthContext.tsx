'use client';

import { createBrowserClient } from '@supabase/ssr';
import { User, Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';

// 인증 컨텍스트 타입 정의
type AuthContextType = {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    error: Error | null;
    refreshSession: () => Promise<void>;
    getUserId: () => string | undefined;
    supabase: any; // Supabase 클라이언트 인스턴스
};

// 기본값으로 초기화된 컨텍스트 생성
const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    isLoading: true,
    error: null,
    refreshSession: async () => { },
    getUserId: () => undefined,
    supabase: null
});

// 컨텍스트 사용을 위한 훅
export const useAuth = () => useContext(AuthContext);

// 인증 Provider 컴포넌트
export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Supabase 클라이언트 생성 - 명시적 옵션 설정
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            // Enhanced cookie options for better session persistence
            cookieOptions: {
                maxAge: 60 * 60 * 24 * 30, // 30 days
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production'
            },
            cookieEncoding: 'base64url'
        }
    );

    // 세션 새로고침 함수
    const refreshSession = useCallback(async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase.auth.getSession();

            if (error) {
                throw error;
            }

            if (data?.session) {
                setSession(data.session);
                setUser(data.session.user);

                // 세션 정보 로깅 (디버깅용)
                console.log('AuthContext: 세션 새로고침 성공', {
                    userId: data.session.user.id,
                    email: data.session.user.email,
                    expires_at: data.session.expires_at
                });
            } else {
                setSession(null);
                setUser(null);
                console.log('AuthContext: 세션 없음');
            }
        } catch (err) {
            console.error('AuthContext: 세션 새로고침 오류', err);
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setIsLoading(false);
        }
    }, [supabase]);

    // 사용자 ID 가져오기 함수
    const getUserId = useCallback(() => {
        return user?.id;
    }, [user]);
    
    // 초기 세션 로드 및 인증 상태 변경 구독
    useEffect(() => {
        // 초기 세션 로드
        refreshSession();

        // 인증 상태 변경 구독
        const { data: authListener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('AuthContext: 인증 상태 변경', event, session?.user?.id);

                if (session) {
                    setSession(session);
                    setUser(session.user);
                } else {
                    setSession(null);
                    setUser(null);
                }

                setIsLoading(false);
            }
        );

        // 컴포넌트 언마운트 시 구독 해제
        return () => {
            authListener.subscription.unsubscribe();
        };
    }, []);

    // 컨텍스트 값
    const value = {
        user,
        session,
        isLoading,
        error,
        refreshSession,
        getUserId,
        supabase
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
