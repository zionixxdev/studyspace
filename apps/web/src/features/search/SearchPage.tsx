import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Folder, MessageCircle, Search, Users, UsersRound } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardBody } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Results {
  users: { id: string; username: string; display_name: string }[];
  groups: { id: string; name: string; description: string | null }[];
  messages: { id: number; conversation_id: string; body: string }[];
  files: { id: string; name: string }[];
  rooms: { id: string; name: string }[];
}

const SCOPES = ['all', 'users', 'groups', 'messages', 'files'] as const;
type Scope = (typeof SCOPES)[number];

export default function SearchPage() {
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [submitted, setSubmitted] = useState('');

  const results = useQuery({
    queryKey: ['search', submitted, scope],
    enabled: submitted.length > 0,
    queryFn: () => api.get<Results>(`/search?q=${encodeURIComponent(submitted)}&scope=${scope}`),
  });

  const total = results.data
    ? Object.values(results.data).reduce((n, arr) => n + arr.length, 0)
    : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(term.trim());
        }}
      >
        <Input
          label="Search StudySpace"
          placeholder="People, communities, messages, files…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          leading={<Search className="h-4 w-4" aria-hidden="true" />}
        />
      </form>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Search scope">
        {SCOPES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            onClick={() => setScope(s)}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium capitalize transition',
              scope === s ? 'bg-brand-600 text-white' : 'bg-surface-muted text-content-muted',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <Card>
        <CardBody className="pt-4">
          {!submitted ? (
            <EmptyState icon={Search} title="Start typing to search" description="Results respect who you're allowed to see." />
          ) : results.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : total === 0 ? (
            <EmptyState icon={Search} title="No matches" description={`Nothing found for “${submitted}”.`} />
          ) : (
            <div className="space-y-5">
              {results.data?.users.length ? (
                <Section title="People" Icon={Users}>
                  {results.data.users.map((u) => (
                    <Link key={u.id} to={`/u/${u.username}`} className="block rounded-lg p-2 hover:bg-surface-muted">
                      <p className="text-sm font-medium">{u.display_name}</p>
                      <p className="text-xs text-content-muted">@{u.username}</p>
                    </Link>
                  ))}
                </Section>
              ) : null}
              {results.data?.groups.length ? (
                <Section title="Communities" Icon={UsersRound}>
                  {results.data.groups.map((g) => (
                    <Link key={g.id} to={`/communities/${g.id}`} className="block rounded-lg p-2 hover:bg-surface-muted">
                      <p className="text-sm font-medium">{g.name}</p>
                      {g.description && <p className="truncate text-xs text-content-muted">{g.description}</p>}
                    </Link>
                  ))}
                </Section>
              ) : null}
              {results.data?.messages.length ? (
                <Section title="Messages" Icon={MessageCircle}>
                  {results.data.messages.map((m) => (
                    <Link key={m.id} to={`/messages/${m.conversation_id}`} className="block rounded-lg p-2 hover:bg-surface-muted">
                      <p className="truncate text-sm">{m.body}</p>
                    </Link>
                  ))}
                </Section>
              ) : null}
              {results.data?.files.length ? (
                <Section title="Files" Icon={Folder}>
                  {results.data.files.map((f) => (
                    <Link key={f.id} to={`/files/${f.id}`} className="block rounded-lg p-2 hover:bg-surface-muted">
                      <p className="truncate text-sm">{f.name}</p>
                    </Link>
                  ))}
                </Section>
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Section({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-content-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden={true} />
        {title}
      </h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}
