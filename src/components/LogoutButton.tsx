'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
    const router = useRouter()
    // Use the consistent client creation function
    const supabase = createClient()

    const handleLogout = async () => {
        try {
            // 기본 Supabase 로그아웃 메서드 호출
            await supabase.auth.signOut();

            // 로그아웃 후 페이지 새로고침 (브라우저 내장 기능 사용)
            window.location.href = '/auth';
        } catch (error) {
            console.error('로그아웃 중 오류 발생:', error);
        }
    }

    return (
        <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm bg-white rounded-lg hover:bg-gray-50"
        >
            Logout
        </button>
    )
}