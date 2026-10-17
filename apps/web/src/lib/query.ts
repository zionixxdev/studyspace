import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry auth/permission failures; do retry transient errors once.
        if (error instanceof ApiRequestError && error.status < 500) return false;
        return failureCount < 1;
      },
    },
    mutations: { retry: 0 },
  },
});
