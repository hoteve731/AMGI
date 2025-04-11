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
function calculateNextDue(
    cardState: string,
    result: 'again' | 'hard' | 'good' | 'easy',
    currentInterval: number,
    currentEase: number,
    repetitionCount: number
) {
    const now = new Date()
    let newDue = new Date(now)
    let newInterval = currentInterval
    let newEase = currentEase || REVIEW_SETTINGS.starting_ease
    let newState = cardState

    // Adjust ease based on response
    if (result === 'again') {
        newEase = Math.max(1.3, newEase - 0.2)
    } else if (result === 'hard') {
        newEase = Math.max(1.3, newEase - 0.15)
    } else if (result === 'good') {
        // No change to ease
    } else if (result === 'easy') {
        newEase = newEase + 0.15
    }

    // Calculate next interval and state based on current state and response
    if (cardState === 'new' || cardState === 'learning') {
        if (result === 'again') {
            newState = 'learning'
            // Reset to first step
            newDue.setMinutes(now.getMinutes() + REVIEW_SETTINGS.steps[0])
            newInterval = REVIEW_SETTINGS.steps[0] / 1440 // Convert minutes to days
        } else if (result === 'good') {
            if (cardState === 'learning' && repetitionCount >= REVIEW_SETTINGS.steps.length - 1) {
                // Graduate the card
                newState = 'graduated'
                newDue.setDate(now.getDate() + REVIEW_SETTINGS.graduating_interval)
                newInterval = REVIEW_SETTINGS.graduating_interval
            } else {
                // Move to next step
                newState = 'learning'
                const stepIndex = Math.min(repetitionCount, REVIEW_SETTINGS.steps.length - 1)
                newDue.setMinutes(now.getMinutes() + REVIEW_SETTINGS.steps[stepIndex])
                newInterval = REVIEW_SETTINGS.steps[stepIndex] / 1440 // Convert minutes to days
            }
        } else if (result === 'easy') {
            // Skip learning and graduate immediately
            newState = 'graduated'
            newDue.setDate(now.getDate() + REVIEW_SETTINGS.graduating_interval * 2)
            newInterval = REVIEW_SETTINGS.graduating_interval * 2
        }
    } else if (cardState === 'graduated' || cardState === 'review') {
        if (result === 'again') {
            // Card needs relearning
            newState = 'relearning'
            newDue.setMinutes(now.getMinutes() + REVIEW_SETTINGS.steps[0])
            newInterval = REVIEW_SETTINGS.steps[0] / 1440 // Convert minutes to days
        } else if (result === 'hard') {
            newState = 'review'
            newInterval = Math.ceil(currentInterval * REVIEW_SETTINGS.hard_interval * REVIEW_SETTINGS.interval_modifier)
            newDue.setDate(now.getDate() + newInterval)
        } else if (result === 'good') {
            newState = 'review'
            newInterval = Math.ceil(currentInterval * newEase * REVIEW_SETTINGS.interval_modifier)
            newDue.setDate(now.getDate() + newInterval)
        } else if (result === 'easy') {
            newState = 'review'
            newInterval = Math.ceil(currentInterval * newEase * REVIEW_SETTINGS.easy_bonus * REVIEW_SETTINGS.interval_modifier)
            newDue.setDate(now.getDate() + newInterval)
        }
    } else if (cardState === 'relearning') {
        if (result === 'again') {
            // Stay in relearning
            newDue.setMinutes(now.getMinutes() + REVIEW_SETTINGS.steps[0])
            newInterval = REVIEW_SETTINGS.steps[0] / 1440 // Convert minutes to days
        } else if (result === 'good') {
            // Return to review
            newState = 'review'
            newInterval = Math.max(1, Math.ceil(currentInterval * 0.5 * REVIEW_SETTINGS.interval_modifier))
            newDue.setDate(now.getDate() + newInterval)
        } else if (result === 'easy') {
            // Return to review with full interval
            newState = 'review'
            newInterval = Math.ceil(currentInterval * REVIEW_SETTINGS.interval_modifier)
            newDue.setDate(now.getDate() + newInterval)
        }
    }

    return {
        due: newDue.getTime(),
        interval: newInterval,
        ease: newEase,
        card_state: newState
    }
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
        console.log('Request cookies:', request.cookies.getAll())

        const supabase = await createClient()
        console.log('Supabase 클라이언트 생성 완료')

        // 서버 측에서 인증된 사용자 확인 시도
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        console.log('User from auth.getUser():', user)

        // 헤더에서 사용자 ID 추출
        const authHeader = request.headers.get('Authorization')
        console.log('Authorization header:', authHeader)

        let userId = user?.id

        // 헤더에서 사용자 ID를 추출 (Bearer 토큰 형식)
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const tokenValue = authHeader.substring(7) // 'Bearer ' 이후의 문자열
            // 주의: 여기서는 클라이언트가 보낸 ID를 사용
            // 프로덕션 환경에서는 추가 검증이 필요할 수 있음
            userId = tokenValue
            console.log('Using ID from Authorization header:', userId)
        }

        if (!userId) {
            console.error('No authenticated user found')
            return NextResponse.json({ error: 'Unauthorized', details: 'No authenticated user found' }, { status: 401 })
        }

        console.log('Proceeding with user ID:', userId)

        // Get current timestamp
        const now = new Date().getTime()

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
        const { data: cards, error: cardsError } = await supabase
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
        content_groups(
          title,
          content_id,
          contents(
            user_id
          )
        )
      `)
            .eq('status', 'active')
            .or(`due.lt.${now},card_state.eq.new`)
            .order('due')
            .limit(50)

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
                console.log('Card does not belong to user:', card.id, 'Group:', card.group_id);
            }

            return belongsToUser;
        });

        console.log(`Filtered to ${filteredCards.length} cards for user ${userId}`);

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

        console.log(`Found ${filteredStats.length} stats cards for user ${userId}`);

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
                    if (card.due && card.due <= now) {
                        stats.due++
                    }
                } else if (card.card_state === 'graduated' || card.card_state === 'review') {
                    stats.review++
                    if (card.due && card.due <= now) {
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
        const supabase = await createClient()

        // 인증 확인
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        // Authorization 헤더가 있는 경우 이를 처리
        const authHeader = request.headers.get('Authorization')
        let userId = user?.id

        // 헤더에서 사용자 ID를 추출 (Bearer 토큰 형식)
        if (!userId && authHeader && authHeader.startsWith('Bearer ')) {
            const tokenUserId = authHeader.substring(7) // 'Bearer ' 이후의 문자열
            if (tokenUserId) {
                userId = tokenUserId
                console.log('Using user ID from Authorization header:', userId)
            }
        }

        if (authError || !userId) {
            console.error('Authentication error:', authError || 'No user ID found')
            return NextResponse.json({ error: 'Unauthorized', details: authError || 'No user ID found' }, { status: 401 })
        }

        // Get request body
        const body = await request.json()
        const { id, result } = body

        if (!id || !result) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // Fetch the current card data
        const { data: card, error: cardError } = await supabase
            .from('content_chunks')
            .select('*')
            .eq('id', id)
            .single()

        if (cardError || !card) {
            console.error('Error fetching card:', cardError)
            return NextResponse.json({ error: 'Card not found' }, { status: 404 })
        }

        // Calculate next due date and updated card state
        const nextState = calculateNextDue(
            card.card_state || 'new',
            result,
            card.interval || 0,
            card.ease || REVIEW_SETTINGS.starting_ease,
            card.repetition_count || 0
        )

        // Update the card
        const { error: updateError } = await supabase
            .from('content_chunks')
            .update({
                card_state: nextState.card_state,
                due: nextState.due,
                ease: nextState.ease,
                interval: nextState.interval,
                repetition_count: (card.repetition_count || 0) + 1,
                last_result: result,
                last_reviewed: new Date().getTime()
            })
            .eq('id', id)

        if (updateError) {
            console.error('Error updating card:', updateError)
            return NextResponse.json({ error: 'Failed to update card' }, { status: 500 })
        }

        return NextResponse.json({ success: true, nextState })
    } catch (error) {
        console.error('Error in review PUT handler:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH handler for updating card status (active/inactive)
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient()

        // 인증 확인
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        // Authorization 헤더가 있는 경우 이를 처리
        const authHeader = request.headers.get('Authorization')
        let userId = user?.id

        // 헤더에서 사용자 ID를 추출 (Bearer 토큰 형식)
        if (!userId && authHeader && authHeader.startsWith('Bearer ')) {
            const tokenUserId = authHeader.substring(7) // 'Bearer ' 이후의 문자열
            if (tokenUserId) {
                userId = tokenUserId
                console.log('Using user ID from Authorization header:', userId)
            }
        }

        if (authError || !userId) {
            console.error('Authentication error:', authError || 'No user ID found')
            return NextResponse.json({ error: 'Unauthorized', details: authError || 'No user ID found' }, { status: 401 })
        }

        // Get request body
        const body = await request.json()
        const { id, status } = body

        if (!id || !status || !['active', 'inactive'].includes(status)) {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
        }

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