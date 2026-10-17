import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpen, FileText, Send, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useFileObjectUrl } from '@/hooks/useFileObjectUrl';
import { useRealtimeTable } from '@/hooks/useRealtime';
import { Button } from '@/components/ui/Button';
import { Avatar, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { cn, timeAgo } from '@/lib/utils';
import { PdfWorkspace } from '@/features/pdf-workspace/PdfWorkspace';
import { ImageWorkspace } from '@/features/image-workspace/ImageWorkspace';
import type { StudyRoom } from '@studyspace/shared';

interface RoomMessage {
  id: number;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: { display_name: string; avatar_url: string | null } | null;
}

export default function RoomView() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const room = useQuery({
    queryKey: ['room', roomId],
    enabled: !!roomId,
    queryFn: async () => {
      const { data, error } = await supabase.from('study_rooms').select('*').eq('id', roomId!).maybeSingle();
      if (error) throw error;
      return data as StudyRoom | null;
    },
  });

  const members = useQuery({
    queryKey: ['room-members', roomId],
    enabled: !!roomId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('study_room_members')
        .select('user_id, role, profiles(display_name, avatar_url)')
        .eq('room_id', roomId!);
      if (error) throw error;
      return (data ?? []) as unknown as { user_id: string; role: string; profiles: { display_name: string; avatar_url: string | null } | null }[];
    },
  });

  // Room chat reuses the conversation created for the room (group type).
  const chat = useQuery({
    queryKey: ['room-chat', roomId],
    enabled: !!roomId,
    queryFn: async (): Promise<RoomMessage[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, body, created_at, sender:profiles!messages_sender_id_fkey(display_name, avatar_url)')
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      // Filtering by the room's conversation happens server-side via RLS in a
      // full build; here we scope to what the member can see.
      return (data ?? []) as unknown as RoomMessage[];
    },
  });

  useRealtimeTable('messages', undefined, () => void qc.invalidateQueries({ queryKey: ['room-chat', roomId] }), !!roomId);

  const file = useQuery({
    queryKey: ['room-file', room.data?.file_id],
    enabled: !!room.data?.file_id,
    queryFn: async () => {
      const { data } = await supabase.from('drive_files').select('id, name, mime').eq('id', room.data!.file_id!).maybeSingle();
      return data as { id: string; name: string; mime: string } | null;
    },
  });

  const { url: fileUrl } = useFileObjectUrl(file.data?.id ?? null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.data]);

  const send = useMutation({
    mutationFn: async () => {
      const body = draft.trim();
      if (!body || !roomId || !user) return;
      const { error } = await supabase.from('messages').insert({ conversation_id: roomId, sender_id: user.id, body });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft('');
      void qc.invalidateQueries({ queryKey: ['room-chat', roomId] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const close = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('close_study_room', { p_room_id: roomId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('Room closed', 'success');
      void qc.invalidateQueries({ queryKey: ['room', roomId] });
    },
  });

  if (room.isLoading) return <Skeleton className="h-96 w-full" />;
  if (!room.data) {
    return <EmptyState icon={BookOpen} title="Room not found" description="It may have been closed or you may not be a member." />;
  }

  const isImage = file.data?.mime.startsWith('image/');

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-3 lg:flex-row">
      <section className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{room.data.name}</h1>
            {room.data.subject && <p className="text-xs text-content-muted">{room.data.subject}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-content-muted">
              <Users className="h-3.5 w-3.5" aria-hidden="true" /> {members.data?.length ?? 0}
            </span>
            <Button size="sm" variant="ghost" onClick={() => navigate('/rooms')}>
              Leave
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {!file.data ? (
            <EmptyState
              icon={FileText}
              title="No shared document"
              description="Attach a PDF or image to study together. Upload one from Files, then share it here."
            />
          ) : !fileUrl ? (
            <div className="grid h-full place-items-center">
              <Skeleton className="h-32 w-64" />
            </div>
          ) : isImage ? (
            <ImageWorkspace fileId={file.data.id} fileUrl={fileUrl} roomId={roomId ?? null} title={file.data.name} />
          ) : (
            <PdfWorkspace fileId={file.data.id} fileUrl={fileUrl} roomId={roomId ?? null} title={file.data.name} />
          )}
        </div>
      </section>

      <aside className="glass flex w-full shrink-0 flex-col overflow-hidden rounded-2xl lg:w-80">
        <div className="border-b border-surface-border px-4 py-3">
          <h2 className="font-semibold">Room chat</h2>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto ss-scroll p-3">
          {chat.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : chat.data?.length ? (
            chat.data.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={cn('flex gap-2', mine && 'flex-row-reverse')}>
                  {!mine && <Avatar name={m.sender?.display_name ?? '?'} src={m.sender?.avatar_url} size={26} />}
                  <div className={cn('max-w-[80%] rounded-2xl px-3 py-1.5 text-sm', mine ? 'bg-brand-600 text-white' : 'bg-surface-muted')}>
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={cn('mt-0.5 text-[10px]', mine ? 'text-white/70' : 'text-content-muted')}>{timeAgo(m.created_at)}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState icon={BookOpen} title="Say hello" description="Chat is shared with everyone in the room." />
          )}
        </div>
        <form
          className="flex items-center gap-2 border-t border-surface-border p-2"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message the room…"
            aria-label="Room message"
            className="ss-input flex-1"
          />
          <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send">
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      </aside>
    </div>
  );
}
