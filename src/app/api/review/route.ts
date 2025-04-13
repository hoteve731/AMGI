import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Spaced repetition algorithm settings
const REVIEW_SETTINGS = {
    steps: [1, 10], // minutes
    graduating_interval: 1, // days
    starting_ease: 2.5,
    easy_bonus: 1.3,
    hard_interval: 1.2,
    interval_modifier: 0.9
}

// Helper function to calculate the next due date based on card state and user response
function calculateNextDueDate(
    currentState: string,
    result: 'again' | 'hard' | 'good' | 'easy',
    currentInterval: number,
    currentEase: number,
    repetitionCount: number
) {
    const now = new Date()
    let newDue = now.getTime()
    let newInterval = currentInterval
    let newEase = currentEase
    let newState = currentState

    // Adjust ease based on response
    if (result === 'again') {
        newEase = Math.max(1.3, newEase - 0.2)
    } else if (result === 'hard') {
        newEase = Math.max(1.3, newEase - 0.15)
    } else if (result === 'easy') {
        newEase = newEase + 0.15
    }

    // Calculate next interval and state based on current state and response
    if (currentState === 'new' || currentState === 'learning') {
        if (result === 'again') {
            newState = 'learning'
            newDue = now.getTime() + REVIEW_SETTINGS.steps[0] * 60 * 1000 // First step in minutes
        } else if (result === 'hard') {
            newState = 'learning'
            newDue = now.getTime() + 5 * 60 * 1000 // 5분 뒤로 설정
        } else if (result === 'good') {
            if (currentState === 'learning' && repetitionCount > 1) {
                newState = 'graduated'
                newInterval = REVIEW_SETTINGS.graduating_interval
                newDue = now.getTime() + newInterval * 24 * 60 * 60 * 1000 // Days to milliseconds
            } else {
                newState = 'learning'
                newDue = now.getTime() + REVIEW_SETTINGS.steps[1] * 60 * 1000 // Second step in minutes
            }
        } else if (result === 'easy') {
            newState = 'graduated'
            newInterval = REVIEW_SETTINGS.graduating_interval * 2
            newDue = now.getTime() + newInterval * 24 * 60 * 60 * 1000 // Days to milliseconds
        }
    } else if (currentState === 'graduated' || currentState === 'review') {
        if (result === 'again') {
            newState = 'relearning'
            newInterval = Math.max(1, Math.floor(currentInterval * 0.5))
            newDue = now.getTime() + 24 * 60 * 60 * 1000 // 1 day in milliseconds
        } else if (result === 'hard') {
            newState = 'review'
            newInterval = Math.ceil(currentInterval * REVIEW_SETTINGS.hard_interval * REVIEW_SETTINGS.interval_modifier)
            newDue = now.getTime() + newInterval * 24 * 60 * 60 * 1000
        } else if (result === 'good') {
            newState = 'review'
            newInterval = Math.ceil(currentInterval * newEase * REVIEW_SETTINGS.interval_modifier)
            newDue = now.getTime() + newInterval * 24 * 60 * 60 * 1000
        } else if (result === 'easy') {
            newState = 'review'
            newInterval = Math.ceil(currentInterval * newEase * REVIEW_SETTINGS.easy_bonus * REVIEW_SETTINGS.interval_modifier)
            newDue = now.getTime() + newInterval * 24 * 60 * 60 * 1000
        }
    } else if (currentState === 'relearning') {
        if (result === 'again') {
            newState = 'relearning'
            newDue = now.getTime() + REVIEW_SETTINGS.steps[0] * 60 * 1000 // First step in minutes
        } else if (result === 'good') {
            newState = 'review'
            newInterval = Math.max(1, Math.ceil(currentInterval * 0.5 * REVIEW_SETTINGS.interval_modifier))
            newDue = now.getTime() + newInterval * 24 * 60 * 60 * 1000
        } else if (result === 'easy') {
            newState = 'review'
            newInterval = Math.ceil(currentInterval * REVIEW_SETTINGS.interval_modifier)
            newDue = now.getTime() + newInterval * 24 * 60 * 60 * 1000
        }
    }

    return { newState, newInterval, newEase, newDue }
}

// 타입 정의 추가
interface ContentChunk {
    id: string;
    group_id: string;
    summary: string;
    masked_text: string;
    card_state: 'new' | 'learning' | 'graduated' | 'review' | 'relearning';
    due: number | null;
    ease: number;
    interval: number;
    repetition_count: number;
    last_result: 'again' | 'hard' | 'good' | 'easy' | null;
    last_reviewed: number | null;
    status: 'active' | 'inactive';
    content_groups: {
        title: string;
        content_id: string;
        contents: {
            user_id: string;
        }[];
    }[];
}

interface StatsChunk {
    card_state: 'new' | 'learning' | 'graduated' | 'review' | 'relearning';
    status: 'active' | 'inactive';
    due: number | null;
    content_groups: {
        contents: {
            user_id: string;
        }[];
    }[];
}

// GET handler for fetching review cards and statistics
export async function GET(request: NextRequest) {
    try {
        console.log('=== API /review GET 요청 시작 ===')
        console.log('Request headers:', Object.fromEntries(request.headers.entries()))

        const supabase = await createClient()
        console.log('Supabase 클라이언트 생성 완료')

        // 사용자 인증 정보 가져오기
        const { data: { user } } = await supabase.auth.getUser()
        const userId = user?.id

        console.log('User ID from session:', userId || 'Not found')

        // 사용자 ID가 있는 경우에만 해당 사용자의 카드를 가져옴
        // 없는 경우 모든 카드를 가져옴 (테스트 목적)
        let query = supabase
            .from('content_chunks')
            .select(`
                id,
                group_id,
                summary,
                masked_text,
                card_state,
                due,
                ease,
                interval,
                repetition_count,
                last_result,
                last_reviewed,
                status,
                content_groups (
                    title,
                    content_id,
                    contents (
                        user_id
                    )
                )
            `)
            .eq('status', 'active')
            .or(`due.lt.${new Date().getTime()},card_state.eq.new`)
            .order('due')
            .limit(50)

        // First check if the card_state column exists
        const { data: columnCheck, error: columnError } = await supabase
            .from('content_chunks')
            .select('id, card_state')
            .limit(1)

        if (columnError) {
            // If there's an error, it might be because the column doesn't exist
            console.error('Column check error:', columnError)
            // Return empty stats to avoid breaking the UI
            return NextResponse.json({
                cards: [],
                stats: { new: 0, learning: 0, review: 0, due: 0, total: 0 },
                needsMigration: true
            })
        }

        // Fetch cards due for review
        const { data: cards, error: cardsError } = await query

        if (cardsError) {
            console.error('Error fetching cards:', cardsError)
            // Return empty stats to avoid breaking the UI
            return NextResponse.json({
                cards: [],
                stats: { new: 0, learning: 0, review: 0, due: 0, total: 0 },
                error: cardsError.message
            })
        }

        // 디버깅을 위해 카드 데이터 로깅
        console.log(`Retrieved ${cards.length} cards before filtering`);

        // Filter cards to only include those belonging to the user
        const filteredCards = (cards as ContentChunk[]).filter(card => {
            if (!card.content_groups) {
                console.log('Card has no content_groups:', card.id, 'Group:', card.group_id);
                return false;
            }

            // Supabase returns a single object instead of an array when using nested selects
            // Convert to array if it's not already
            const groups = Array.isArray(card.content_groups)
                ? card.content_groups
                : [card.content_groups];

            // 각 content_group에 대해 확인
            const belongsToUser = groups.some(group => {
                if (!group.contents) {
                    return false;
                }

                // Ensure contents is an array
                const contents = Array.isArray(group.contents)
                    ? group.contents
                    : [group.contents];

                // 각 content에 대해 user_id 확인
                return contents.some(content => content.user_id === userId);
            });

            if (!belongsToUser) {
                console.log('Card does not belong to user:', card.id);
            }
            return belongsToUser;
        });

        console.log(`Filtered to ${filteredCards.length} cards for user ${userId || 'unknown'}`);

        // Fetch statistics for all cards
        const { data: statsData, error: statsError } = await supabase
            .from('content_chunks')
            .select(`
                card_state,
                status,
                due,
                content_groups(
                    contents(
                        user_id
                    )
                )
            `)

        if (statsError) {
            console.error('Error fetching stats:', statsError)
            return NextResponse.json({
                cards: filteredCards,
                stats: { new: 0, learning: 0, review: 0, due: 0, total: 0 },
                error: statsError.message
            })
        }

        // Filter stats to only include those belonging to the user
        const filteredStats = (statsData as StatsChunk[]).filter(card => {
            if (!card.content_groups) {
                return false;
            }

            // Ensure content_groups is an array
            const groups = Array.isArray(card.content_groups)
                ? card.content_groups
                : [card.content_groups];

            return groups.some(group => {
                if (!group.contents) {
                    return false;
                }

                // Ensure contents is an array
                const contents = Array.isArray(group.contents)
                    ? group.contents
                    : [group.contents];

                return contents.some(content => content.user_id === userId);
            });
        });

        console.log(`Found ${filteredStats.length} stats cards for user ${userId || 'unknown'}`);

        // Calculate statistics
        const stats = {
            new: 0,
            learning: 0,
            review: 0,
            due: 0,
            total: 0
        }

        filteredStats.forEach(card => {
            if (card.status === 'active') {
                stats.total++

                if (card.card_state === 'new') {
                    stats.new++
                    stats.due++
                } else if (card.card_state === 'learning' || card.card_state === 'relearning') {
                    stats.learning++
                    if (card.due && card.due <= new Date().getTime()) {
                        stats.due++
                    }
                } else if (card.card_state === 'graduated' || card.card_state === 'review') {
                    stats.review++
                    if (card.due && card.due <= new Date().getTime()) {
                        stats.due++
                    }
                }
            }
        })

        return NextResponse.json({ cards: filteredCards, stats })
    } catch (error) {
        console.error('Error in review GET handler:', error)
        return NextResponse.json({
            cards: [],
            stats: { new: 0, learning: 0, review: 0, due: 0, total: 0 },
            error: 'Internal server error',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}

// PUT handler for updating card after review
export async function PUT(request: NextRequest) {
    try {
        console.log('=== API /review PUT 요청 시작 ===')
        console.log('Request headers:', Object.fromEntries(request.headers.entries()))

        const supabase = await createClient()

        // Get request body
        const body = await request.json()
        const { id, result } = body

        if (!id || !result) {
            return NextResponse.json({ error: 'Bad Request', details: 'Missing required fields: id or result' }, { status: 400 })
        }

        console.log(`Updating card ${id} with result: ${result}`)

        // Fetch the current card data
        const { data: card, error: cardError } = await supabase
            .from('content_chunks')
            .select('*')
            .eq('id', id)
            .single()

        if (cardError) {
            console.error('Error fetching card:', cardError)
            return NextResponse.json({ error: 'Card not found', details: cardError.message }, { status: 404 })
        }

        // Calculate next due date and updated card state
        const now = new Date()
        const currentState = card.card_state || 'new'
        const currentInterval = card.interval || 0
        const currentEase = card.ease || REVIEW_SETTINGS.starting_ease
        const repetitionCount = (card.repetition_count || 0) + 1

        const { newState, newInterval, newEase, newDue } = calculateNextDueDate(
            currentState,
            result,
            currentInterval,
            currentEase,
            repetitionCount
        )

        console.log(`Card update: state=${currentState}->${newState}, interval=${currentInterval}->${newInterval}, ease=${currentEase}->${newEase}, due=${new Date(newDue).toISOString()}`)

        // Update the card
        const { error: updateError } = await supabase
            .from('content_chunks')
            .update({
                card_state: newState,
                interval: newInterval,
                ease: newEase,
                due: newDue,
                repetition_count: repetitionCount,
                last_result: result,
                last_reviewed: now.getTime()
            })
            .eq('id', id)

        if (updateError) {
            console.error('Error updating card:', updateError)
            return NextResponse.json({ error: 'Failed to update card', details: updateError.message }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error in PUT handler:', error)
        return NextResponse.json({
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 })
    }
}

// PATCH handler for updating card status (active/inactive)
export async function PATCH(request: NextRequest) {
    try {
        console.log('=== API /review PATCH 요청 시작 ===')
        console.log('Request headers:', Object.fromEntries(request.headers.entries()))

        const supabase = await createClient()

        // Get request body
        const body = await request.json()
        const { id, status } = body

        if (!id || !status) {
            return NextResponse.json({ error: 'Bad Request', details: 'Missing required fields: id or status' }, { status: 400 })
        }

        console.log(`Updating card ${id} status to: ${status}`)

        // Update the card status
        const { error: updateError } = await supabase
            .from('content_chunks')
            .update({ status })
            .eq('id', id)

        if (updateError) {
            console.error('Error updating card status:', updateError)
            return NextResponse.json({ error: 'Failed to update card status' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error in review PATCH handler:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}