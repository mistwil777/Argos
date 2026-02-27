// CockpitApp - Point d'entrée principal du cockpit VeilleOps
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './layout/AppShell';
import { CockpitProvider } from './context/CockpitContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

export function CockpitApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <CockpitProvider>
        <AppShell />
      </CockpitProvider>
    </QueryClientProvider>
  );
}
