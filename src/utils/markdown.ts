import { marked } from 'marked';
import { Snippet } from './snippetUtils';
import DOMPurify from 'isomorphic-dompurify';

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
  // 먼저 마크다운을 HTML로 변환
  const html = marked(markdownText);

  // 스니펫 타이틀 목록 생성 (중복 제거 및 길이 기준 내림차순 정렬)
  const snippetTitles = [...new Set(snippets.map(s => s.header_text))]
    .filter(title => title && title.trim() !== '') // 비어있는 타이틀 제외
    .sort((a, b) => b.length - a.length); // 긴 제목부터 처리하여 부분 매칭 문제 방지

  if (snippetTitles.length === 0) {
    return html;
  }

  // DOM 파싱을 위한 임시 컨테이너 생성
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 텍스트 노드만 처리하는 함수 (이미 링크나 코드 블록 내부는 처리하지 않음)
  const processTextNodes = (node: Node) => {
    // 코드 블록이나 pre 태그 내부는 처리하지 않음
    if (
      node.parentElement?.tagName === 'CODE' ||
      node.parentElement?.tagName === 'PRE' ||
      node.parentElement?.tagName === 'A'
    ) {
      return;
    }

    // 텍스트 노드인 경우에만 처리
    if (node.nodeType === Node.TEXT_NODE && node.textContent) {
      let text = node.textContent;
      let modified = false;

      // 각 스니펫 타이틀에 대해 처리
      for (const title of snippetTitles) {
        if (text.includes(title)) {
          modified = true;

          // 텍스트를 타이틀 기준으로 분할
          const parts = text.split(title);
          const fragment = document.createDocumentFragment();

          // 해당 타이틀을 가진 스니펫 ID 목록
          const matchingSnippets = snippets.filter(s => s.header_text === title);
          const snippetIds = matchingSnippets.map(s => s.id).join(',');

          // 분할된 텍스트와 링크 요소를 번갈아가며 추가
          for (let i = 0; i < parts.length; i++) {
            // 분할된 텍스트 추가
            if (parts[i]) {
              fragment.appendChild(document.createTextNode(parts[i]));
            }

            // 마지막 부분이 아니면 링크 요소 추가
            if (i < parts.length - 1) {
              if (matchingSnippets.length === 1) {
                // 단일 스니펫인 경우 직접 링크 사용
                const link = document.createElement('a');
                // 안전한 URL 생성을 위해 encodeURIComponent 사용
                link.href = `/snippets/${encodeURIComponent(matchingSnippets[0].id)}`;
                link.className = 'snippet-link';
                link.dataset.snippetId = matchingSnippets[0].id;
                link.textContent = title;
                fragment.appendChild(link);
              } else if (matchingSnippets.length > 1) {
                // 중복 스니펫인 경우 스판 사용
                const span = document.createElement('span');
                span.className = 'snippet-modal-trigger';
                // 쉼표가 포함된 ID들을 적절히 인코딩
                span.dataset.snippetIds = snippetIds.split(',').map(id => encodeURIComponent(id)).join(',');
                span.dataset.snippetTitle = title;
                span.textContent = title;
                fragment.appendChild(span);
              }
            }
          }

          // 원래 노드를 fragment로 교체
          if (node.parentNode) {
            node.parentNode.replaceChild(fragment, node);
            return; // 이 노드는 이미 처리되었으므로 종료
          }
        }
      }

      // 수정되지 않은 경우 다음 노드로 진행
      if (!modified) {
        return;
      }
    }

    // 자식 노드들에 대해 재귀적으로 처리
    const childNodes = [...node.childNodes];
    for (const child of childNodes) {
      processTextNodes(child);
    }
  };

  // body의 모든 텍스트 노드 처리
  processTextNodes(doc.body);

  // 처리된 HTML 반환 (XSS 방지를 위한 sanitize 적용)
  return DOMPurify.sanitize(doc.body.innerHTML);
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
