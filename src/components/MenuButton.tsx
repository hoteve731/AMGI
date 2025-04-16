"use client";

"use client";

import React, { useState } from 'react';
import SideMenu from './SideMenu';

const MenuButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  const openMenu = () => setIsOpen(true);
  const closeMenu = () => setIsOpen(false);

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
      <SideMenu open={isOpen} onClose={closeMenu} />
    </>
  );
};

export default MenuButton;

