import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// 스니펫 타입 정의
export type Snippet = {
  id: string;
  header_text: string;
  snippet_type: string;
  markdown_content: string;
  created_at?: string;
  user_id?: string;
  tags?: string[];
}

// 모든 스니펫 가져오기
export const fetchAllSnippets = async (): Promise<Snippet[]> => {
  const supabase = createClientComponentClient();
  try {
    // 모든 스니펫을 가져옵니다 (사용자 필터링 없음)
    const { data, error } = await supabase
      .from('snippets')
      .select('id, header_text, snippet_type, markdown_content, created_at, user_id');

    if (error) {
      console.error('fetchAllSnippets: 스니펫 조회 중 오류:', error);
      return [];
    }

    console.log(`fetchAllSnippets: 총 ${data?.length || 0}개의 스니펫을 반환합니다.`);
    return data || [];
  } catch (err: any) {
    console.error('fetchAllSnippets: 스니펫 조회 중 예외 발생:', err.message || err);
    return [];
  }
};

// 헤더 텍스트로 스니펫 검색
export const findSnippetsByHeaderText = (snippets: Snippet[], headerText: string): Snippet[] => {
  return snippets.filter(snippet =>
    snippet.header_text.toLowerCase() === headerText.toLowerCase()
  );
};
