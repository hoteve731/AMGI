import { marked } from 'marked';

/**
 * 마크다운 텍스트를 HTML로 변환하는 함수
 * @param markdownText 원본 마크다운 텍스트
 * @param contentId 현재 콘텐츠의 ID (옵션)
 * @returns 변환된 HTML
 */
export const renderMarkdownWithSnippetIcons = (markdownText: string, contentId?: string): string => {
    // 마크다운을 HTML로 변환 (스니펫 아이콘 없이)
    const html = marked(markdownText);
    return html;
};

// 전역 변수로 이벤트 핸들러 참조 저장
let currentClickHandler: ((event: Event) => void) | null = null;

/**
 * 스니펫 아이콘 클릭 이벤트 핸들러 등록
 * @param onSnippetIconClick 스니펫 아이콘 클릭 시 호출될 콜백 함수
 */
export const registerSnippetIconClickHandlers = (
    onSnippetIconClick: (headerText: string, headerId: string, contentId: string) => void
): void => {
    // 더 이상 사용하지 않음
    removeSnippetIconClickHandlers();
};

/**
 * 스니펫 아이콘 클릭 이벤트 핸들러 제거
 */
export const removeSnippetIconClickHandlers = (): void => {
    // 더 이상 사용하지 않음
    currentClickHandler = null;
};
