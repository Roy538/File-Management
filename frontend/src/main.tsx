import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';
import { router } from '@/app/router';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { useSession } from '@/features/auth/session';
import { ApiError } from '@/lib/api/client';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Don't hammer the server for answers that won't change: missing, forbidden or invalid.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
  queryCache: new QueryCache(),
  // Mutations that don't handle their own errors still tell the user what happened.
  mutationCache: new MutationCache({
    onError: (error, _v, _c, mutation) => {
      if (mutation.options.onError) return;
      toast.error(error instanceof ApiError ? error.message : 'The change could not be saved.');
    },
  }),
});

function App() {
  const bootstrap = useSession((s) => s.bootstrap);
  const status = useSession((s) => s.status);
  useEffect(() => { void bootstrap(); }, [bootstrap]);
  // A different user signing in must never see the previous user's cached data.
  useEffect(() => { if (status === 'signedOut') queryClient.clear(); }, [status]);
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
