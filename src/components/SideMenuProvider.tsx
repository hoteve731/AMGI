import React, { useState, useEffect, createContext, useContext } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import SideMenu from './SideMenu';
import Header from './Header';

// Define the ContentGroup type based on your Supabase schema
interface ContentGroup {
  id: string;
  content_id: string;
  title: string | null;
  original_text: string | null;
  position: number;
  activeCardCount?: number;
}

// Define the structure for content items passed to SideMenu
interface FormattedContent {
  id: string;
  title: string | null;
  content_groups: ContentGroup[];
  groups_count: number;
}

interface SideMenuContextType {
  isOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
  contents: FormattedContent[];
  isLoading: boolean;
  error: Error | null;
  fetchContents: () => Promise<void>;
}

const SideMenuContext = createContext<SideMenuContextType>({
  isOpen: false,
  openMenu: () => { },
  closeMenu: () => { },
  toggleMenu: () => { },
  contents: [],
  isLoading: false,
  error: null,
  fetchContents: async () => { },
});

export const useSideMenu = () => useContext(SideMenuContext);

export const SideMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [contents, setContents] = useState<FormattedContent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const router = useRouter();
  const supabase = createClientComponentClient();

  const openMenu = () => setIsOpen(true);
  const closeMenu = () => setIsOpen(false);
  const toggleMenu = () => setIsOpen(prev => !prev);

  const fetchContents = async () => {
    console.log('Fetching contents for side menu...');
    setIsLoading(true);
    setError(null);

    try {
      // 현재 로그인한 사용자의 세션 가져오기
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.log('No active session found.');
        setContents([]);
        setIsLoading(false);
        return;
      }

      // Fetch contents and related groups/chunks as needed
      // Ensure 'position' is selected for content_groups
      const { data, error } = await supabase
        .from('contents')
        .select(`
          id,
          title,
          created_at,
          content_groups (
            id,
            content_id,
            title,
            original_text,
            position,
            content_chunks ( id, status )
          )
        `)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      if (!data) {
        console.log('No content data found.');
        setContents([]);
        setIsLoading(false);
        return;
      }

      console.log('Raw content data from Supabase:', data);

      // Transform data to the required format
      const formattedContents: FormattedContent[] = data.map((content) => {
        // Explicitly type groups and handle potential single object vs array
        let groups: ContentGroup[] = [];

        if (content.content_groups) {
          // Ensure content_groups is always an array
          const rawGroups = Array.isArray(content.content_groups)
            ? content.content_groups
            : [content.content_groups];

          // Filter out nulls/undefined and map to ContentGroup type
          // This also ensures each group object has the expected structure
          groups = rawGroups
            .filter((g): g is NonNullable<typeof g & { id: string, content_id: string, title: string | null, original_text: string | null, position: number, content_chunks: any[] | any | null }> => g != null && typeof g === 'object')
            .map(g => {
              // Map Supabase group data to our ContentGroup type
              // Calculate activeCardCount here
              let activeCardCount = 0;
              if (g.content_chunks) {
                const chunks = Array.isArray(g.content_chunks) ? g.content_chunks : [g.content_chunks];
                // Ensure chunks are valid objects before filtering
                activeCardCount = chunks.filter(chunk => chunk && chunk.status === 'active').length;
              }

              return {
                id: g.id,
                content_id: g.content_id,
                title: g.title,
                original_text: g.original_text,
                position: g.position,
                activeCardCount: activeCardCount,
              };
            })
            // Sort groups by position after mapping
            .sort((a, b) => a.position - b.position);
        }

        if (groups.length === 0) {
          console.log(`Content ${content.id} (${content.title || 'Untitled'}) has no valid groups after processing.`);
        } else {
          console.log(`Content ${content.id} (${content.title || 'Untitled'}) groups found:`, groups);
        }


        return {
          id: content.id,
          title: content.title,
          content_groups: groups,
          groups_count: groups.length,
        };
      }).filter((content): content is FormattedContent => content !== null);

      console.log('Formatted contents for side menu:', formattedContents);
      setContents(formattedContents);

    } catch (err) {
      console.error('Error fetching side menu contents:', err);
      setError(err instanceof Error ? err : new Error('An unknown error occurred'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
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
  }, []);

  const handleSelectContent = (contentId: string) => {
    router.push(`/content/${contentId}/groups`);
    closeMenu();
  };

  return (
    <SideMenuContext.Provider value={{ isOpen, openMenu, closeMenu, toggleMenu, contents, isLoading, error, fetchContents }}>
      <SideMenu
        open={isOpen}
        onClose={closeMenu}
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
