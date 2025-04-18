import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useEffect } from 'react';
import { getSupabaseClient } from './supabase';

// Supabase 실시간 구독을 관리하는 클래스
export class RealtimeSubscription {
    private static instances: { [key: string]: RealtimeSubscription } = {};
    private channels: { [key: string]: RealtimeChannel } = {}; // 채널을 객체로 관리 (key: 테이블명)
    private supabase = getSupabaseClient();
    private callbacks: { [table: string]: ((payload: RealtimePostgresChangesPayload<any>) => void)[] } = {};

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
        callback: (payload: RealtimePostgresChangesPayload<any>) => void,
        events: ('INSERT' | 'UPDATE' | 'DELETE')[] = ['INSERT', 'UPDATE', 'DELETE']
    ): () => void {
        // 콜백 등록
        if (!this.callbacks[table]) {
            this.callbacks[table] = [];
        }
        this.callbacks[table].push(callback);

        // 해당 테이블에 대한 채널이 없으면 새로 생성하고 구독
        if (!this.channels[table]) {
            const eventString = events.length === 3 ? '*' : events.join(','); // 이벤트 문자열 생성
            const channel = this.supabase
                .channel(`table-db-changes-${table}`) // 각 테이블별 고유 채널 이름 사용
                .on<any>( // payload 타입을 any로 지정 (혹은 구체적인 타입 정의 필요)
                    'postgres_changes',
                    {
                        event: eventString as any, // 타입 단언 사용 (혹은 더 정확한 타입 필요)
                        schema: 'public',
                        table: table
                    },
                    (payload: RealtimePostgresChangesPayload<any>) => {
                        // 해당 테이블에 등록된 모든 콜백 실행
                        if (this.callbacks[table]) {
                            this.callbacks[table].forEach(cb => cb(payload));
                        }
                    }
                )
                .subscribe((status, err) => {
                    if (status === 'SUBSCRIBED') {
                        console.log(`Subscribed to ${table} changes`);
                    }
                    if (status === 'CHANNEL_ERROR') {
                        console.error(`Error subscribing to ${table}:`, err);
                    }
                });

            this.channels[table] = channel; // 생성된 채널 저장
        }

        // 구독 해제 함수 반환
        return () => {
            if (this.callbacks[table]) {
                this.callbacks[table] = this.callbacks[table].filter(cb => cb !== callback);

                // 해당 테이블에 콜백이 더 이상 없으면 채널 구독 해제 및 제거
                if (this.callbacks[table].length === 0) {
                    const channelToRemove = this.channels[table];
                    if (channelToRemove) {
                        this.supabase.removeChannel(channelToRemove);
                        delete this.channels[table]; // 채널 객체에서 제거
                    }
                    delete this.callbacks[table];
                }
            }
        };
    }
}

// React Hook으로 사용하기 위한 함수
export function useRealtimeSubscription(
    table: string,
    callback: (payload: RealtimePostgresChangesPayload<any>) => void,
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