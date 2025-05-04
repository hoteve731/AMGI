import React, { useState, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import SideMenu from './SideMenu';
import Header from './Header';

interface SideMenuContextType {
  isOpen: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
}

const SideMenuContext = createContext<SideMenuContextType>({
  isOpen: false,
  openMenu: () => { },
  closeMenu: () => { },
  toggleMenu: () => { },
});

export const useSideMenu = () => useContext(SideMenuContext);

export const SideMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const openMenu = () => setIsOpen(true);
  const closeMenu = () => setIsOpen(false);
  const toggleMenu = () => setIsOpen(prev => !prev);

  return (
    <SideMenuContext.Provider value={{ isOpen, openMenu, closeMenu, toggleMenu }}>
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
