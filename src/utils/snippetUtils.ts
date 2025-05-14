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

export const fetchAllSnippets = async (): Promise<Snippet[]> => {
  try {
    // 세션 없이 모든 스니펫을 가져오고 나중에 필터링
    const supabase = createClientComponentClient();
    
    // 기본 스니펫 정보만 가져오기
    const { data, error } = await supabase
      .from('snippets')
      .select('id, header_text, snippet_type, markdown_content, created_at, user_id');

    if (error) {
      console.error('fetchAllSnippets: 스니펫 조회 중 오류:', error);
      return [];
    }

    // 현재 세션 가져오기
    const { data: sessionData } = await supabase.auth.getSession();
    console.log('Session data in fetchAllSnippets:', sessionData);
    
    const userId = sessionData?.session?.user?.id;
    
    if (!userId) {
      console.warn('fetchAllSnippets: 인증된 사용자 세션을 찾을 수 없습니다. 모든 스니펫을 반환합니다.');
      console.log(`fetchAllSnippets: 총 ${data?.length || 0}개의 스니펫을 반환합니다.`);
      return data || [];
    }

    // 클라이언트 측에서 현재 사용자의 스니펫만 필터링
    const userSnippets = data?.filter(snippet => snippet.user_id === userId) || [];
    console.log(`fetchAllSnippets: 총 ${userSnippets.length}개의 사용자 스니펫을 반환합니다.`);
    return userSnippets;
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
