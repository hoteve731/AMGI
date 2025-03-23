export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            contents: {
                Row: {
                    id: string
                    created_at: string
                    user_id: string
                    title: string
                    original_text: string
                    chunks: Json[]
                    masked_chunks: Json[]
                    next_review: string | null
                    review_count: number
                    ease_factor: number
                    interval: number
                }
                Insert: {
                    id?: string
                    created_at?: string
                    user_id: string
                    title: string
                    original_text: string
                    chunks: Json[]
                    masked_chunks: Json[]
                    next_review?: string | null
                    review_count?: number
                    ease_factor?: number
                    interval?: number
                }
                Update: {
                    id?: string
                    created_at?: string
                    user_id?: string
                    title?: string
                    original_text?: string
                    chunks?: Json[]
                    masked_chunks?: Json[]
                    next_review?: string | null
                    review_count?: number
                    ease_factor?: number
                    interval?: number
                }
            }
            user_settings: {
                Row: {
                    id: string
                    user_id: string
                    notification_enabled: boolean
                    notification_time: string
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    notification_enabled?: boolean
                    notification_time?: string
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    notification_enabled?: boolean
                    notification_time?: string
                    created_at?: string
                }
            }
        }
    }
} 