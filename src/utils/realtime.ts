import { RealtimeChannel } from '@supabase/supabase-js';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useEffect } from 'react';
import { getSupabaseClient } from './supabase';

// Supabase 실시간 구독을 관리하는 클래스
export class RealtimeSubscription {
    private static instances: { [key: string]: RealtimeSubscription } = {};
    private channels: RealtimeChannel[] = [];
    private supabase = getSupabaseClient();
    private callbacks: { [table: string]: ((payload: any) => void)[] } = {};

    // 싱글톤 인스턴스 가져오기
    public static getInstance(id: string = 'default'): RealtimeSubscription {
        if (!this.instances[id]) {
            this.instances[id] = new RealtimeSubscription();
        }
        return this.instances[id];
    }

    // 테이블 변경 구독
    public subscribeToTable(
        table: string,
        callback: (payload: any) => void,
        events: ('INSERT' | 'UPDATE' | 'DELETE')[] = ['INSERT', 'UPDATE', 'DELETE']
    ): () => void {
        // 콜백 등록
        if (!this.callbacks[table]) {
            this.callbacks[table] = [];
        }
        this.callbacks[table].push(callback);

        // 이미 구독 중인 채널이 없으면 새로 생성
        if (this.channels.length === 0) {
            const channel = this.supabase
                .channel(`table-changes-${table}`)
                .on('postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: table
                    },
                    (payload) => {
                        // 해당 테이블에 등록된 모든 콜백 실행
                        if (this.callbacks[table]) {
                            this.callbacks[table].forEach(cb => cb(payload));
                        }
                    }
                )
                .subscribe();

            this.channels.push(channel);
        }

        // 구독 해제 함수 반환
        return () => {
            if (this.callbacks[table]) {
                this.callbacks[table] = this.callbacks[table].filter(cb => cb !== callback);

                // 콜백이 없으면 채널 제거
                if (this.callbacks[table].length === 0) {
                    delete this.callbacks[table];
                    this.cleanupChannels();
                }
            }
        };
    }

    // 사용하지 않는 채널 정리
    private cleanupChannels() {
        if (Object.keys(this.callbacks).length === 0 && this.channels.length > 0) {
            this.channels.forEach(channel => {
                this.supabase.removeChannel(channel);
            });
            this.channels = [];
        }
    }
}

// React Hook으로 사용하기 위한 함수
export function useRealtimeSubscription(
    table: string,
    callback: (payload: any) => void,
    dependencies: any[] = []
): void {
    useEffect(() => {
        // 테이블 변경 구독
        const subscription = RealtimeSubscription.getInstance();
        const unsubscribe = subscription.subscribeToTable(table, callback);

        // 클린업 함수
        return () => {
            unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, dependencies);
} 