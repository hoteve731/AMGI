import { marked } from 'marked';
import { Snippet } from './snippetUtils';

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

/**
 * 마크다운 텍스트를 HTML로 변환하고 스니펫 타이틀을 클릭 가능한 요소로 변환하는 함수
 * @param markdownText 원본 마크다운 텍스트
 * @param snippets 스니펫 목록
 * @returns 변환된 HTML
 */
export const renderMarkdownWithSnippetLinks = (
  markdownText: string,
  snippets: Snippet[]
): string => {
  // 스니펫 타이틀 목록 생성 (중복 제거 및 길이 기준 내림차순 정렬)
  const snippetTitles = [...new Set(snippets.map(s => s.header_text))]
    .filter(title => title && title.trim() !== '') // 비어있는 타이틀 제외
    .sort((a, b) => b.length - a.length); // 긴 제목부터 처리하여 부분 매칭 문제 방지
  
  // 마크다운 텍스트에서 스니펫 타이틀을 링크로 변환
  let processedText = markdownText;
  
  // 스니펫 타이틀을 링크로 변환
  snippetTitles.forEach(title => {
    if (!title) return; // null 또는 undefined 값 처리
    
    // 정규식 패턴: 단어 경계(\b)로 둘러싸인 스니펫 타이틀
    // 정규식을 사용하지 않고 정확한 문자열 매칭으로 변경
    const titleRegex = new RegExp(escapeRegExp(title), 'g');
    
    // 해당 타이틀을 가진 스니펫 ID 목록
    const matchingSnippets = snippets.filter(s => s.header_text === title);
    const snippetIds = matchingSnippets.map(s => s.id).join(',');
    
    // 스니펫 타이틀을 클릭 가능한 요소로 변환
    if (matchingSnippets.length === 1) {
      // 단일 스니펫인 경우 직접 HTML 링크 사용
      const linkHtml = `<a href="/snippets/${matchingSnippets[0].id}" class="snippet-link" data-snippet-id="${matchingSnippets[0].id}">${title}</a>`;
      processedText = processedText.replace(titleRegex, linkHtml);
    } else if (matchingSnippets.length > 1) {
      // 중복 스니펫인 경우 HTML 스판 사용
      const spanHtml = `<span class="snippet-modal-trigger" data-snippet-ids="${snippetIds}" data-snippet-title="${title}">${title}</span>`;
      processedText = processedText.replace(titleRegex, spanHtml);
    }
  });
  
  // 마크다운을 HTML로 변환
  const html = marked(processedText);
  
  return html;
};

// 정규식 특수문자 이스케이프 함수
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
