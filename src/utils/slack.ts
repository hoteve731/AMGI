/**
 * Slack 알림 전송을 위한 유틸리티 함수
 */

type SlackMessageAttachment = {
    color?: string;
    pretext?: string;
    title?: string;
    text?: string;
    fields?: {
        title: string;
        value: string;
        short?: boolean;
    }[];
    ts?: string;
};

type SlackMessage = {
    text?: string;
    attachments?: SlackMessageAttachment[];
};

/**
 * Slack으로 알림 메시지를 전송합니다.
 */
export async function sendSlackNotification(message: SlackMessage): Promise<boolean> {
    try {
        const webhookUrl = process.env.SLACK_WEBHOOK_URL;

        if (!webhookUrl) {
            console.error('SLACK_WEBHOOK_URL 환경 변수가 설정되지 않았습니다.');
            return false;
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });

        if (!response.ok) {
            throw new Error(`Slack API 오류: ${response.status} ${response.statusText}`);
        }

        return true;
    } catch (error) {
        console.error('Slack 알림 전송 실패:', error);
        return false;
    }
}

/**
 * 새 콘텐츠 생성 알림을 전송합니다.
 */
export async function notifyNewContent(userId: string, contentId: string, title: string, email?: string): Promise<boolean> {
    const message: SlackMessage = {
        text: '🎉 새 콘텐츠가 생성되었습니다!',
        attachments: [
            {
                color: '#5F4BB6', // AMGI 보라색
                fields: [
                    {
                        title: '사용자 ID',
                        value: userId,
                        short: true,
                    },
                    {
                        title: '사용자 이메일',
                        value: email || '(이메일 없음)',
                        short: true,
                    },
                    {
                        title: '제목',
                        value: title || '(제목 없음)',
                        short: false,
                    },
                ],
                ts: Math.floor(Date.now() / 1000).toString(),
            },
        ],
    };

    return sendSlackNotification(message);
}

/**
 * 새 사용자 가입 알림을 전송합니다.
 */
export async function notifyNewUser(userId: string, email: string): Promise<boolean> {
    const message: SlackMessage = {
        text: '👋 새 사용자가 가입했습니다!',
        attachments: [
            {
                color: '#36a64f', // 녹색
                fields: [
                    {
                        title: '사용자 ID',
                        value: userId,
                        short: true,
                    },
                    {
                        title: '이메일',
                        value: email || '(이메일 없음)',
                        short: true,
                    },
                ],
                ts: Math.floor(Date.now() / 1000).toString(),
            },
        ],
    };

    return sendSlackNotification(message);
}

/**
 * 리뷰 페이지 접속 알림을 전송합니다.
 */
export async function notifyReviewPageAccess(userId: string, cardCount: number, email?: string): Promise<boolean> {
    const message: SlackMessage = {
        text: '📚 사용자가 리뷰 페이지에 접속했습니다!',
        attachments: [
            {
                color: '#FDFF8C', // 노란색
                fields: [
                    {
                        title: '사용자 ID',
                        value: userId,
                        short: true,
                    },
                    {
                        title: '사용자 이메일',
                        value: email || '(이메일 없음)',
                        short: true,
                    },
                    {
                        title: '리뷰 카드 수',
                        value: cardCount.toString(),
                        short: true,
                    },
                ],
                ts: Math.floor(Date.now() / 1000).toString(),
            },
        ],
    };

    return sendSlackNotification(message);
}