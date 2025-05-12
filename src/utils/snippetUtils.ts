import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// 스니펫 타입 정의
export type Snippet = {
  id: string;
  header_text: string;
  snippet_type: string;
  markdown_content?: string;
  created_at?: string;
}

// 모든 스니펫 가져오기
export const fetchAllSnippets = async (): Promise<Snippet[]> => {
  const supabase = createClientComponentClient();
  const { data, error } = await supabase
    .from('snippets')
    .select('id, header_text, snippet_type, created_at');
  
  if (error) {
    console.error('스니펫 조회 중 오류:', error);
    return [];
  }
  
  return data || [];
};

// 헤더 텍스트로 스니펫 검색
export const findSnippetsByHeaderText = (snippets: Snippet[], headerText: string): Snippet[] => {
  return snippets.filter(snippet => 
    snippet.header_text.toLowerCase() === headerText.toLowerCase()
  );
};
