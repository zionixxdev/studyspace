import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeTable } from '@/hooks/useRealtime';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { cn, timeAgo } from '@/lib/utils';
import type { AppNotification } from '@studyspace/shared';

export default function Notifications() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['notifications'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AppNotification[];
    },
  });

  // Live updates as notifications arrive.
  useRealtimeTable(
    'notifications',
    user ? `user_id=eq.${user.id}` : undefined,
    () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
    !!user,
  );

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['unread'] });
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['unread'] });
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <Button variant="secondary" size="sm" onClick={() => markAll.mutate()} loading={markAll.isPending}>
          <CheckCheck className="h-4 w-4" aria-hidden="true" /> Mark all read
        </Button>
      </header>

      <Card>
        <CardBody className="pt-4">
          {list.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : list.data?.length ? (
            <ul className="divide-y divide-surface-border">
              {list.data.map((n) => {
                const inner = (
                  <div className="flex items-start gap-3 py-3">
                    <span
                      className={cn(
                        'mt-1 h-2 w-2 shrink-0 rounded-full',
                        n.read_at ? 'bg-transparent' : 'bg-brand-500',
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body && <p className="truncate text-sm text-content-muted">{n.body}</p>}
                      <p className="mt-0.5 text-xs text-content-muted">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link
                        to={n.link}
                        onClick={() => !n.read_at && markRead.mutate(n.id)}
                        className="block rounded-lg hover:bg-surface-muted"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <button
                        onClick={() => !n.read_at && markRead.mutate(n.id)}
                        className="block w-full text-left hover:bg-surface-muted"
                      >
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={Bell} title="You're all caught up" description="New activity will appear here." />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
