import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './features/auth/AuthProvider';
import { ThemeProvider } from './features/theme/ThemeProvider';
import { ToastProvider } from './components/ui/toast';
import { ApiError } from './lib/api';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      // The API client already retries transient failures once; never retry auth/validation errors.
      retry: (count, err) => count < 1 && !(err instanceof ApiError && !['NETWORK', 'BUSY', 'INTERNAL'].includes(err.code))
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
