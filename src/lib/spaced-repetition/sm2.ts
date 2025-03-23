export type Quality = 0 | 1 | 2 | 3 | 4 | 5

export interface SM2Parameters {
    quality: Quality
    repetitions: number
    easeFactor: number
    interval: number
}

export function calculateNextReview({
    quality,
    repetitions,
    easeFactor,
    interval,
}: SM2Parameters): {
    nextInterval: number
    newEaseFactor: number
    newRepetitions: number
} {
    // SM2 알고리즘 구현
    let newRepetitions = quality >= 3 ? repetitions + 1 : 0
    let newEaseFactor = easeFactor

    if (quality < 3) {
        newRepetitions = 0
        interval = 1
    } else {
        newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        if (newEaseFactor < 1.3) newEaseFactor = 1.3
    }

    let nextInterval
    if (newRepetitions <= 1) {
        nextInterval = 1
    } else if (newRepetitions === 2) {
        nextInterval = 6
    } else {
        nextInterval = Math.round(interval * newEaseFactor)
    }

    return {
        nextInterval,
        newEaseFactor,
        newRepetitions,
    }
}

export function qualityToScore(quality: 'again' | 'hard' | 'good' | 'easy'): Quality {
    switch (quality) {
        case 'again': return 0
        case 'hard': return 2
        case 'good': return 4
        case 'easy': return 5
        default: return 3
    }
}

export function calculateNextReviewDate(interval: number): Date {
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + interval)
    return nextDate
} 