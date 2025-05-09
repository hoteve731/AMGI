import { marked } from 'marked';

/**
 * 마크다운 텍스트에서 헤더에 스니펫 아이콘을 추가하는 함수
 * @param markdownText 원본 마크다운 텍스트
 * @param contentId 현재 콘텐츠의 ID (옵션)
 * @returns 스니펫 아이콘이 추가된 HTML
 */
export const renderMarkdownWithSnippetIcons = (markdownText: string, contentId?: string): string => {
    // 먼저 마크다운을 HTML로 변환
    const html = marked(markdownText);

    // 헤더 태그에 스니펫 아이콘 추가
    const modifiedHtml = html.replace(
        /<(h[1-5])([^>]*)>(.*?)<\/h[1-5]>/g,
        (match, tag, attributes, content) => {
            // 고유 ID 생성 (헤더 내용 기반)
            const headerId = `header-${encodeURIComponent(content.trim().replace(/\s+/g, '-').toLowerCase())}`;

            // 스니펫 아이콘 추가 (클릭 가능한 버튼으로 변경)
            return `<${tag}${attributes} id="${headerId}">
        ${content} 
        <button 
          class="snippet-icon" 
          data-header-id="${headerId}" 
          data-header-text="${encodeURIComponent(content.trim())}" 
          data-content-id="${contentId || ''}"
          aria-label="스니펫 생성"
        >✨</button>
      </${tag}>`;
        }
    );

    return modifiedHtml;
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
    // 기존 핸들러가 있으면 먼저 제거
    removeSnippetIconClickHandlers();

    // 새로운 클릭 핸들러 생성
    currentClickHandler = (event: Event) => {
        event.stopPropagation(); // 이벤트 버블링 방지
        event.preventDefault(); // 기본 동작 방지

        const element = event.currentTarget as HTMLElement;
        const headerId = element.getAttribute('data-header-id') || '';
        const headerText = decodeURIComponent(element.getAttribute('data-header-text') || '');
        const contentId = element.getAttribute('data-content-id') || '';

        // 콜백 함수 호출
        onSnippetIconClick(headerText, headerId, contentId);
    };

    // 약간의 지연 후 이벤트 핸들러 등록 (DOM이 완전히 업데이트된 후)
    setTimeout(() => {
        const snippetIcons = document.querySelectorAll('.snippet-icon');
        console.log('스니펫 아이콘 찾음:', snippetIcons.length);

        snippetIcons.forEach((icon) => {
            icon.addEventListener('click', currentClickHandler);
        });
    }, 100);
};

/**
 * 스니펫 아이콘 클릭 이벤트 핸들러 제거
 */
export const removeSnippetIconClickHandlers = (): void => {
    if (currentClickHandler) {
        const snippetIcons = document.querySelectorAll('.snippet-icon');

        snippetIcons.forEach((icon) => {
            icon.removeEventListener('click', currentClickHandler!);
        });

        currentClickHandler = null;
    }
};
