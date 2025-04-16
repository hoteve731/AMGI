"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface HeaderProps {
  onMenuClick: () => void;
  title?: string;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, title }) => {
  const pathname = usePathname();
  
  // Don't show header on login page
  if (pathname === '/login') return null;
  
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 h-14 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          aria-label="메뉴 열기"
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors duration-200"
          onClick={onMenuClick}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
        <h1 className="font-medium text-lg">{title || 'LOOPA'}</h1>
      </div>
    </header>
  );
};

export default Header;
