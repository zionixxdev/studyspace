import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface UnreadCounts {
  unread_messages: number;
  unread_notifications: number;
  pending_requests: number;
}

/** Live-ish unread counters, refreshed on an interval and on auth changes. */
export function useUnread() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['unread', user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async (): Promise<UnreadCounts> => {
      const { data, error } = await supabase.rpc('get_unread_counts');
      if (error) throw error;
      return (data?.[0] as UnreadCounts) ?? {
        unread_messages: 0,
        unread_notifications: 0,
        pending_requests: 0,
      };
    },
  });
}
