import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageCircle, Send, Smile, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useBroadcast, useRealtimeTable } from '@/hooks/useRealtime';
import { Button } from '@/components/ui/Button';
import { Avatar, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { cn, timeAgo } from '@/lib/utils';

interface ConversationRow {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  last_message_at: string | null;
  other?: { username: string; display_name: string; avatar_url: string | null } | null;
  unread?: number;
}

interface MessageRow {
  id: number;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  sender?: { username: string; display_name: string; avatar_url: string | null } | null;
  reactions?: { emoji: string; user_id: string }[];
}

const QUICK_REACTIONS = ['👍', '🎯', '🔥', '✅'];

export default function Messages() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversations = useQuery({
    queryKey: ['conversations'],
    enabled: !!user,
    queryFn: async (): Promise<ConversationRow[]> => {
      const { data, error } = await supabase
        .from('conversation_members')
        .select(
          'muted, conversations(id, type, title, last_message_at), profiles:user_id(username, display_name, avatar_url)',
        )
        .eq('user_id', user!.id)
        .order('joined_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as unknown as {
          conversations: { id: string; type: 'direct' | 'group'; title: string | null; last_message_at: string | null };
          profiles: { username: string; display_name: string; avatar_url: string | null } | null;
        };
        return { ...r.conversations, other: r.conversations.type === 'group' ? null : r.profiles };
      });
    },
  });

  const messages = useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<MessageRow[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(username, display_name, avatar_url)')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  // Live new messages for the open conversation.
  useRealtimeTable(
    'messages',
    conversationId ? `conversation_id=eq.${conversationId}` : undefined,
    () => void qc.invalidateQueries({ queryKey: ['messages', conversationId] }),
    !!conversationId,
  );

  // Ephemeral typing indicator (broadcast, not persisted).
  const sendTyping = useBroadcast(
    conversationId ? `typing:${conversationId}` : 'typing:none',
    'typing',
    (payload) => {
      const p = payload as { userId?: string; name?: string };
      if (p.userId && p.userId !== user?.id) {
        setTypingFrom(p.name ?? 'Someone');
        window.setTimeout(() => setTypingFrom(null), 2500);
      }
    },
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.data]);

  const send = useMutation({
    mutationFn: async () => {
      const body = draft.trim();
      if (!body || !conversationId || !user) return;
      const { error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: user.id, body });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft('');
      void qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const react = useMutation({
    mutationFn: async ({ id, emoji }: { id: number; emoji: string }) => {
      const { error } = await supabase
        .from('message_reactions')
        .upsert({ message_id: id, user_id: user!.id, emoji }, { onConflict: 'message_id,user_id,emoji' });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['messages', conversationId] }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('messages')
        .update({ deleted_at: new Date().toISOString(), body: '[deleted]' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['messages', conversationId] }),
  });

  const active = useMemo(
    () => conversations.data?.find((c) => c.id === conversationId),
    [conversations.data, conversationId],
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] max-w-6xl overflow-hidden rounded-2xl">
      {/* Conversation list */}
      <aside
        className={cn(
          'glass w-full shrink-0 overflow-y-auto ss-scroll sm:w-72 lg:w-80',
          conversationId && 'hidden sm:block',
        )}
      >
        <div className="border-b border-surface-border px-4 py-3">
          <h1 className="text-lg font-semibold">Messages</h1>
        </div>
        {conversations.isLoading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : conversations.data?.length ? (
          <ul>
            {conversations.data.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => navigate(`/messages/${c.id}`)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-surface-muted',
                    c.id === conversationId && 'bg-surface-muted',
                  )}
                >
                  <Avatar name={c.other?.display_name ?? c.title ?? 'Group'} src={c.other?.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.title ?? c.other?.display_name ?? 'Conversation'}
                    </p>
                    <p className="text-xs text-content-muted">{timeAgo(c.last_message_at)}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={MessageCircle}
            title="No conversations"
            description="Find a classmate in People and start chatting."
          />
        )}
      </aside>

      {/* Thread */}
      <section className={cn('glass ml-0 flex min-w-0 flex-1 flex-col', !conversationId && 'hidden sm:flex')}>
        {!conversationId ? (
          <div className="grid flex-1 place-items-center">
            <EmptyState icon={MessageCircle} title="Pick a conversation" description="Or start a new one from People." />
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-surface-border px-4 py-3">
              <button className="sm:hidden text-sm text-brand-500" onClick={() => navigate('/messages')}>
                Back
              </button>
              <Avatar
                name={active?.other?.display_name ?? active?.title ?? 'Conversation'}
                src={active?.other?.avatar_url}
                size={36}
              />
              <div className="min-w-0">
                <p className="truncate font-medium">{active?.other?.display_name ?? active?.title ?? 'Conversation'}</p>
                {typingFrom && <p className="text-xs text-brand-500">{typingFrom} is typing…</p>}
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto ss-scroll p-4">
              {messages.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : messages.data?.length ? (
                messages.data.map((m) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={cn('group flex gap-2', mine && 'flex-row-reverse')}>
                      {!mine && <Avatar name={m.sender?.display_name ?? '?'} src={m.sender?.avatar_url} size={28} />}
                      <div className={cn('max-w-[75%]', mine && 'items-end')}>
                        <div
                          className={cn(
                            'rounded-2xl px-3 py-2 text-sm',
                            mine ? 'bg-brand-600 text-white' : 'bg-surface-muted text-content',
                          )}
                        >
                          {m.deleted_at ? (
                            <span className="italic opacity-70">message deleted</span>
                          ) : (
                            <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-content-muted">
                          <span>{timeAgo(m.created_at)}</span>
                          {m.edited_at && <span>· edited</span>}
                          {!m.deleted_at && (
                            <span className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                              {QUICK_REACTIONS.map((e) => (
                                <button
                                  key={e}
                                  aria-label={`React ${e}`}
                                  onClick={() => react.mutate({ id: m.id, emoji: e })}
                                  className="rounded px-0.5 hover:bg-surface-muted"
                                >
                                  {e}
                                </button>
                              ))}
                              {mine && (
                                <button
                                  aria-label="Delete message"
                                  onClick={() => remove.mutate(m.id)}
                                  className="rounded px-0.5 hover:text-rose-500"
                                >
                                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                                </button>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState icon={MessageCircle} title="No messages yet" description="Send the first one." />
              )}
            </div>

            <form
              className="flex items-center gap-2 border-t border-surface-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate();
              }}
            >
              <input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (e.target.value) sendTyping({ userId: user?.id, name: user?.email?.split('@')[0] });
                }}
                placeholder="Write a message…"
                aria-label="Message"
                maxLength={4000}
                className="ss-input flex-1"
              />
              <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send message">
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
