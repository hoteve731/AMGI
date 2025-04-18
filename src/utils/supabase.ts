import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { SupabaseClient } from '@supabase/supabase-js';

// Supabase 클라이언트 생성 함수 (실시간 기능 활성화)
export function createRealtimeClient() {
    return createClientComponentClient({
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        // realtime 옵션 제거 - 기본값으로 실시간 기능 사용
    });
}

// 기본 Supabase 클라이언트 인스턴스 (싱글톤)
let supabaseClient: SupabaseClient;

export function getSupabaseClient() {
    if (!supabaseClient) {
        supabaseClient = createRealtimeClient();
    }
    return supabaseClient;
} 