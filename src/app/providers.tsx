// src/app/providers.tsx
'use client';

import { AuthProvider } from '@/contexts/AuthContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { useEffect } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  console.log('Providers 컴포넌트 마운트됨');
  
  return (
    <AuthProvider>
      <SubscriptionProvider>
        {children}
      </SubscriptionProvider>
    </AuthProvider>
  );
}