import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Supabase 클라이언트 생성 함수 (실시간 기능 활성화)
export function createRealtimeClient() {
    return createClientComponentClient({
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        options: {
            realtime: {
                enabled: true,
            },
        },
    });
}

// 기본 Supabase 클라이언트 인스턴스 (싱글톤)
let supabaseClient;

export function getSupabaseClient() {
    if (!supabaseClient) {
        supabaseClient = createRealtimeClient();
    }
    return supabaseClient;
} 