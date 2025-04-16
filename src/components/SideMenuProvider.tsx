import React, { useState, useEffect, createContext, useContext } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import SideMenu from './SideMenu';
import Header from './Header';

// Define the content type based on the SideMenu component requirements
interface ContentInfo {
  id: string;
  title: string;
  groupCount: number;
  cardCount: number;
}

interface SideMenuContextType {
  isOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
}

const SideMenuContext = createContext<SideMenuContextType>({
  isOpen: false,
  openMenu: () => {},
  closeMenu: () => {},
  toggleMenu: () => {},
});

export const useSideMenu = () => useContext(SideMenuContext);

export const SideMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [contents, setContents] = useState<ContentInfo[]>([]);
  const router = useRouter();
  const supabase = createClientComponentClient();

  const openMenu = () => setIsOpen(true);
  const closeMenu = () => setIsOpen(false);
  const toggleMenu = () => setIsOpen(prev => !prev);

  // Fetch contents for the side menu
  useEffect(() => {
    const fetchContents = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) return;

        // Fetch contents with their groups and chunks
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

        // Transform data to the required format
        const formattedContents: ContentInfo[] = data.map(content => {
          // Handle potential single object vs array issue with Supabase nested selects
          const groups = Array.isArray(content.content_groups) 
            ? content.content_groups 
            : content.content_groups ? [content.content_groups] : [];
          
          let totalCardCount = 0;
          
          // Count all chunks across all groups
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
    
    // Set up subscription for real-time updates
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
    <SideMenuContext.Provider value={{ isOpen, openMenu, closeMenu, toggleMenu }}>
      <SideMenu 
        open={isOpen} 
        onClose={closeMenu} 
        contents={contents} 
        onSelectContent={handleSelectContent} 
      />
      {children}
    </SideMenuContext.Provider>
  );
};

// Header with menu button component
export const HeaderWithMenu: React.FC<{ title?: string }> = ({ title }) => {
  const { openMenu } = useSideMenu();
  
  return <Header onMenuClick={openMenu} title={title} />;
};
