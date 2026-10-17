import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadRuntimeConfig } from './lib/runtimeConfig';
import './index.css';

/**
 * Boot sequence. Runtime config is fetched BEFORE the app modules are imported,
 * because those modules read configuration when they are first evaluated (the
 * Supabase client is created at import time). Importing them dynamically keeps
 * that ordering correct.
 */
async function boot() {
  await loadRuntimeConfig();

  const [
    { QueryClientProvider },
    { BrowserRouter },
    { queryClient },
    { AuthProvider },
    { ThemeProvider },
    { ToastProvider },
    { ErrorBoundary },
    { App },
  ] = await Promise.all([
    import('@tanstack/react-query'),
    import('react-router-dom'),
    import('./lib/query'),
    import('./contexts/AuthContext'),
    import('./contexts/ThemeContext'),
    import('./components/ui/Toast'),
    import('./components/layout/ErrorBoundary'),
    import('./App'),
  ]);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ToastProvider>
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </ToastProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

void boot();
