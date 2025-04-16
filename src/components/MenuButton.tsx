"use client";

import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import SideMenu from './SideMenu';

interface ContentInfo {
  id: string;
  title: string;
  groupCount: number;
  cardCount: number;
}

const MenuButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [contents, setContents] = useState<ContentInfo[]>([]);
  const router = useRouter();
  const supabase = createClientComponentClient();

  const openMenu = () => setIsOpen(true);
  const closeMenu = () => setIsOpen(false);

  // 콘텐츠 데이터 가져오기
  useEffect(() => {
    const fetchContents = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) return;

        // 콘텐츠, 그룹, 청크 데이터 가져오기
        const { data, error } = await supabase
          .from('contents')
          .select(`
            id,
            title,
            content_groups (id),
            content_groups!content_groups_content_id_fkey (id, content_chunks(id))
          `)
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching contents:', error);
          return;
        }

        // 데이터 형식 변환
        const formattedContents: ContentInfo[] = data.map(content => {
          // Supabase 중첩 쿼리 결과가 단일 객체 또는 배열로 반환될 수 있음
          const groups = Array.isArray(content.content_groups) 
            ? content.content_groups 
            : content.content_groups ? [content.content_groups] : [];
          
          let totalCardCount = 0;
          
          // 모든 그룹의 청크 개수 계산
          groups.forEach((group: any) => {
            const groupData = group['content_groups!content_groups_content_id_fkey'] || group;
            const chunks = Array.isArray(groupData.content_chunks) 
              ? groupData.content_chunks 
              : groupData.content_chunks ? [groupData.content_chunks] : [];
            totalCardCount += chunks.length;
          });

          return {
            id: content.id,
            title: content.title,
            groupCount: groups.length,
            cardCount: totalCardCount
          };
        });

        setContents(formattedContents);
      } catch (error) {
        console.error('Error in fetchContents:', error);
      }
    };

    fetchContents();
    
    // 실시간 업데이트를 위한 구독 설정
    const contentSubscription = supabase
      .channel('content-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'contents' 
      }, () => {
        fetchContents();
      })
      .subscribe();

    return () => {
      contentSubscription.unsubscribe();
    };
  }, [supabase]);

  const handleSelectContent = (contentId: string) => {
    router.push(`/content/${contentId}/groups`);
    closeMenu();
  };

  return (
    <>
      <button
        aria-label="메뉴 열기"
        className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors duration-200"
        onClick={openMenu}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>
      
      <SideMenu 
        open={isOpen} 
        onClose={closeMenu} 
        contents={contents} 
        onSelectContent={handleSelectContent} 
      />
    </>
  );
};

export default MenuButton;
