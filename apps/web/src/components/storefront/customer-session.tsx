'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { AuthUser } from '@/lib/api-types';
import { getStoredCustomerUser } from '@/lib/customer-client';

const CustomerSessionContext = createContext<{
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  isLoading: boolean;
}>({
  user: null,
  setUser: () => {},
  isLoading: true,
});

export function CustomerSessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setUser(getStoredCustomerUser());
    setIsLoading(false);
  }, []);

  return (
    <CustomerSessionContext.Provider value={{ user, setUser, isLoading }}>
      {children}
    </CustomerSessionContext.Provider>
  );
}

export function useCustomerSession() {
  return useContext(CustomerSessionContext);
}
