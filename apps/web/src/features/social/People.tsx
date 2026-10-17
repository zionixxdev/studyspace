import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Search, UserCheck, UserPlus, UserX, Ban } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar, EmptyState, Skeleton } from '@/components/ui/Feedback';

interface Person {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface Request {
  id: string;
  requester_id: string;
  status: string;
  profiles: Person;
}

export default function People() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');

  const search = useQuery({
    queryKey: ['people-search', submitted],
    enabled: submitted.length > 0,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${submitted}%,display_name.ilike.%${submitted}%`)
        .neq('id', user!.id)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Person[];
    },
  });

  const incoming = useQuery({
    queryKey: ['friend-requests-incoming'],
    enabled: !!user,
    queryFn: async (): Promise<Request[]> => {
      const { data, error } = await supabase
        .from('friend_requests')
        .select('id, requester_id, status, profiles!friend_requests_requester_id_fkey(id, username, display_name, avatar_url)')
        .eq('target_id', user!.id)
        .eq('status', 'pending');
      if (error) throw error;
      return (data ?? []) as unknown as Request[];
    },
  });

  const friends = useQuery({
    queryKey: ['friends'],
    enabled: !!user,
    queryFn: async (): Promise<Person[]> => {
      const { data, error } = await supabase
        .from('friend_requests')
        .select('requester_id, target_id, status')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user!.id},target_id.eq.${user!.id}`);
      if (error) throw error;
      const ids = (data ?? []).map((r) => (r.requester_id === user!.id ? r.target_id : r.requester_id));
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', ids);
      return (profiles ?? []) as Person[];
    },
  });

  const sendRequest = useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await supabase
        .from('friend_requests')
        .insert({ requester_id: user!.id, target_id: targetId });
      if (error) throw error;
    },
    onSuccess: () => toast('Request sent', 'success'),
    onError: (e: Error) =>
      toast(e.message.includes('duplicate') ? 'A request is already pending' : e.message, 'error'),
  });

  const respond = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: accept ? 'accepted' : 'rejected', responded_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['friend-requests-incoming'] });
      void qc.invalidateQueries({ queryKey: ['friends'] });
      void qc.invalidateQueries({ queryKey: ['unread'] });
    },
  });

  const block = useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await supabase.from('blocks').upsert({ blocker_id: user!.id, blocked_id: targetId });
      if (error) throw error;
    },
    onSuccess: () => toast('User blocked', 'success'),
  });

  async function startConversation(person: Person) {
    const { data, error } = await supabase.rpc('create_conversation', {
      p_member_ids: [person.id],
      p_type: 'direct',
    });
    if (error) {
      toast(error.message, 'error');
      return;
    }
    const conv = data as { id: string } | null;
    if (conv?.id) navigate(`/messages/${conv.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">People</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(term.trim());
        }}
      >
        <Input
          label="Find classmates"
          placeholder="Search by name or username"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          leading={<Search className="h-4 w-4" aria-hidden="true" />}
        />
      </form>

      {submitted && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
          </CardHeader>
          <CardBody>
            {search.isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : search.data?.length ? (
              <ul className="divide-y divide-surface-border">
                {search.data.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <Avatar name={p.display_name} src={p.avatar_url} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.display_name}</p>
                      <p className="truncate text-xs text-content-muted">@{p.username}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => sendRequest.mutate(p.id)}>
                      <UserPlus className="h-4 w-4" aria-hidden="true" /> Add
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => startConversation(p)} aria-label="Message">
                      <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => block.mutate(p.id)} aria-label="Block">
                      <Ban className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={Search} title="No matches" description="Try another name or username." />
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Friend requests</CardTitle>
        </CardHeader>
        <CardBody>
          {incoming.data?.length ? (
            <ul className="divide-y divide-surface-border">
              {incoming.data.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-3">
                  <Avatar name={r.profiles.display_name} src={r.profiles.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.profiles.display_name}</p>
                    <p className="truncate text-xs text-content-muted">@{r.profiles.username}</p>
                  </div>
                  <Button size="sm" onClick={() => respond.mutate({ id: r.id, accept: true })}>
                    <UserCheck className="h-4 w-4" aria-hidden="true" /> Accept
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => respond.mutate({ id: r.id, accept: false })} aria-label="Reject">
                    <UserX className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={UserPlus} title="No pending requests" description="Requests you receive show up here." />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your friends</CardTitle>
        </CardHeader>
        <CardBody>
          {friends.data?.length ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {friends.data.map((f) => (
                <li key={f.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-muted">
                  <Avatar name={f.display_name} src={f.avatar_url} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{f.display_name}</p>
                    <p className="truncate text-xs text-content-muted">@{f.username}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => startConversation(f)} aria-label={`Message ${f.display_name}`}>
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={UserPlus} title="No friends yet" description="Search above and send a request." />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
