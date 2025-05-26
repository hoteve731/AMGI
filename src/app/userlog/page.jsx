'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';

export default function SimpleUserLogPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const router = useRouter();

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                console.log("--- 테스트 시작: 사용자 데이터 가져오기 ---");
                setIsLoading(true);
                setError(null);

                // Initialize Supabase client
                const supabase = createClientComponentClient();

                // 1. Get current session
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();

                if (sessionError || !session) {
                    console.error("세션을 가져오는 중 오류 발생:", sessionError?.message || 'No active session');
                    setError('로그인이 필요합니다. 로그인 페이지로 이동합니다.');
                    
                    return;
                }

                console.log("1. 인증된 사용자 정보:");
                console.log("   User ID:", session.user.id);
                console.log("   Email:", session.user.email);

                // 2. Get user data from custom 'users' table
                const { data: userData, error: userError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                if (userError && userError.code !== 'PGRST116') {
                    console.error("사용자 데이터를 가져오는 중 오류 발생:", userError.message);
                    setError('사용자 정보를 불러오는 중 오류가 발생했습니다.');
                    return;
                }


                if (!userData) {
                    console.warn(`2. 사용자 프로필이 아직 생성되지 않았습니다.`);
                } else {
                    console.log("2. 사용자 프로필 정보:", userData);
                }

            } catch (err) {
                console.error("예상치 못한 오류 발생:", err);
                setError('오류가 발생했습니다. 나중에 다시 시도해주세요.');
            } finally {
                setIsLoading(false);
                console.log("--- 테스트 종료 ---");
            }
        };

        fetchUserData();
    }, [router]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">사용자 정보를 불러오는 중...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative max-w-md mx-auto" role="alert">
                    <strong className="font-bold">오류 발생! </strong>
                    <span className="block sm:inline">{error}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">사용자 정보</h1>
            <div className="bg-white rounded-lg shadow p-6">
                <p className="text-gray-600">콘솔에서 자세한 사용자 정보를 확인하세요.</p>
                <p className="mt-2 text-sm text-gray-500">개발자 도구(F12)를 열고 Console 탭을 확인해주세요.</p>
            </div>
        </div>
    );
}