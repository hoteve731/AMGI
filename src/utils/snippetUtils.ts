'use client';

import { useAuth } from '@/contexts/AuthContext';

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

/**
 * 클라이언트 컴포넌트에서 사용할 수 있는 훅
 * AuthContext를 활용하여 현재 사용자의 스니펙을 가져옵니다.
 */
export const useSnippets = () => {
  const { user, session, isLoading, getUserId, supabase } = useAuth();
  
  const fetchSnippets = async (): Promise<Snippet[]> => {
    if (isLoading) {
      console.log('useSnippets: 인증 상태 로딩 중...');
      return [];
    }
    
    // AuthContext의 supabase 인스턴스 사용
    try {
      const userId = getUserId();
      console.log('useSnippets: 현재 사용자 ID:', userId || '인증되지 않음');
      
      if (!userId) {
        return [];
      }
      
      // 스니펙 쿼리 실행
      const { data, error } = await supabase
        .from('snippets')
        .select('id, header_text, snippet_type, markdown_content, created_at, user_id')
        .eq('user_id', userId);
      
      if (error) {
        console.error('useSnippets: 스니펙 조회 중 오류:', error);
        return [];
      }
      
      if (!data || data.length === 0) {
        console.log('useSnippets: 스니펙이 없습니다.');
        return [];
      }
      
      console.log(`useSnippets: ${data.length}개의 스니펙을 가져왔습니다.`);
      return data as Snippet[];
    } catch (error) {
      console.error('useSnippets: 예외 발생:', error);
      return [];
    }
  };
  
  return {
    fetchSnippets,
    isLoading,
    userId: getUserId()
  };
};

/**
 * 모든 스니펙을 가져오는 함수 (API 호출 방식)
 * 클라이언트와 서버 모두에서 사용 가능
 */
export const fetchAllSnippets = async (): Promise<Snippet[]> => {
  try {
    // API 라우트 호출
    const response = await fetch('/api/snippets');
    
    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.snippets || data.snippets.length === 0) {
      console.log('fetchAllSnippets: 스니펙이 없습니다.');
      return [];
    }
    
    // 태그 정보 처리
    const processedSnippets = data.snippets.map((snippet: any) => {
      // 태그 관계가 있는 경우 처리
      if (snippet.snippet_tag_relations) {
        // 태그 관계가 배열인지 확인 (단일 객체일 수도 있음)
        const relations = Array.isArray(snippet.snippet_tag_relations)
          ? snippet.snippet_tag_relations
          : [snippet.snippet_tag_relations];
        
        // 태그 추출
        const extractedTags = relations
          .filter((relation: any) => relation.snippet_tags)
          .map((relation: any) => ({
            id: relation.snippet_tags.id,
            name: relation.snippet_tags.name,
            relation_id: relation.id
          }));
        
        return {
          ...snippet,
          tags: extractedTags
        };
      }
      
      // 태그 관계가 없는 경우 빈 배열 설정
      return {
        ...snippet,
        tags: []
      };
    });
    
    console.log(`fetchAllSnippets: ${processedSnippets.length}개의 스니펙을 가져왔습니다.`);
    return processedSnippets as Snippet[];
  } catch (error) {
    console.error('fetchAllSnippets: 예외 발생:', error);
    return [];
  }
};

/**
 * 헤더 텍스트로 스니펫 검색
 */
// 헤더 텍스트로 스니펫 검색
export const findSnippetsByHeaderText = (snippets: Snippet[], headerText: string): Snippet[] => {
  return snippets.filter(snippet =>
    snippet.header_text.toLowerCase().includes(headerText.toLowerCase())
  );
};
