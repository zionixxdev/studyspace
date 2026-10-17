import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BookOpen, CalendarDays, Clock, Folder, MessageCircle, Plus, UsersRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton, Badge } from '@/components/ui/Feedback';
import { formatDuration, timeAgo } from '@/lib/utils';
import type { Task } from '@studyspace/shared';

interface Stats {
  todaySeconds: number;
  weekSeconds: number;
  sessionsThisWeek: number;
  activeDays: number;
}

export default function Dashboard() {
  const { profile } = useAuth();

  const stats = useQuery({
    queryKey: ['study-stats'],
    queryFn: () => api.get<Stats>('/study-sessions/stats'),
  });

  const conversations = useQuery({
    queryKey: ['dashboard-conversations'],
    queryFn: async () => {
      const { data } = await supabase
        .from('conversation_members')
        .select('conversations(id, type, title, last_message_at)')
        .order('joined_at', { ascending: false })
        .limit(5);
      return (data ?? []) as unknown as { conversations: { id: string; title: string | null; last_message_at: string | null } }[];
    },
  });

  const tasks = useQuery({
    queryKey: ['dashboard-tasks'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tasks')
        .select('*')
        .is('completed_at', null)
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(6);
      return (data ?? []) as Task[];
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-sm text-content-muted">Here's what's on your desk today.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/focus">
            <Button variant="secondary">
              <Clock className="h-4 w-4" aria-hidden="true" /> Start focus
            </Button>
          </Link>
          <Link to="/rooms">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" /> New room
            </Button>
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Focus today', value: stats.data ? formatDuration(stats.data.todaySeconds) : '—' },
          { label: 'This week', value: stats.data ? formatDuration(stats.data.weekSeconds) : '—' },
          { label: 'Sessions', value: stats.data ? String(stats.data.sessionsThisWeek) : '—' },
          { label: 'Active days', value: stats.data ? String(stats.data.activeDays) : '—' },
        ].map((s) => (
          <Card key={s.label}>
            <CardBody className="pt-4">
              <p className="text-sm text-content-muted">{s.label}</p>
              {stats.isLoading ? (
                <Skeleton className="mt-2 h-7 w-20" />
              ) : (
                <p className="mt-1 text-2xl font-semibold">{s.value}</p>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Today's tasks</CardTitle>
            <Link to="/tasks" className="text-sm text-brand-500 hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardBody>
            {tasks.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : tasks.data?.length ? (
              <ul className="divide-y divide-surface-border">
                {tasks.data.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      {t.subject && <p className="text-xs text-content-muted">{t.subject}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={t.priority === 'urgent' ? 'danger' : t.priority === 'high' ? 'warn' : 'neutral'}
                      >
                        {t.priority}
                      </Badge>
                      {t.due_at && (
                        <span className="text-xs text-content-muted">{timeAgo(t.due_at)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No tasks yet"
                description="Add an assignment or a revision goal to get started."
                action={
                  <Link to="/tasks">
                    <Button size="sm" variant="secondary">
                      Create a task
                    </Button>
                  </Link>
                }
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent chats</CardTitle>
            <Link to="/messages" className="text-sm text-brand-500 hover:underline">
              Open
            </Link>
          </CardHeader>
          <CardBody>
            {conversations.data?.length ? (
              <ul className="space-y-2">
                {conversations.data.map((row) => (
                  <li key={row.conversations.id}>
                    <Link
                      to={`/messages/${row.conversations.id}`}
                      className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-muted"
                    >
                      <MessageCircle className="h-4 w-4 text-content-muted" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {row.conversations.title ?? 'Direct message'}
                      </span>
                      <span className="text-xs text-content-muted">
                        {timeAgo(row.conversations.last_message_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={MessageCircle} title="No conversations" description="Say hello to a classmate." />
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { to: '/communities', label: 'Communities', Icon: UsersRound, hint: 'Join a study group' },
          { to: '/rooms', label: 'Study rooms', Icon: BookOpen, hint: 'Work together live' },
          { to: '/files', label: 'Files', Icon: Folder, hint: 'Your shared materials' },
        ].map((q) => (
          <Link key={q.to} to={q.to}>
            <Card className="transition hover:-translate-y-0.5">
              <CardBody className="flex items-center gap-3 pt-4">
                <span className="rounded-xl bg-brand-500/15 p-2 text-brand-500">
                  <q.Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium">{q.label}</p>
                  <p className="text-xs text-content-muted">{q.hint}</p>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
