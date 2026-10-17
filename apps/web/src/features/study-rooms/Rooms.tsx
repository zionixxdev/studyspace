import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { createRoomSchema, type StudyRoom } from '@studyspace/shared';

type Form = z.infer<typeof createRoomSchema>;

export default function Rooms() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const rooms = useQuery({
    queryKey: ['rooms'],
    enabled: !!user,
    queryFn: async (): Promise<{ room: StudyRoom; role: string }[]> => {
      const { data, error } = await supabase
        .from('study_room_members')
        .select('role, study_rooms(*)')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => ({ room: (r as unknown as { study_rooms: StudyRoom }).study_rooms, role: (r as { role: string }).role }));
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(createRoomSchema) });

  const create = useMutation({
    mutationFn: async (values: Form) => {
      const { data, error } = await supabase.rpc('create_study_room', {
        p_name: values.name,
        p_subject: values.subject ?? null,
      });
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (room) => {
      toast('Study room created', 'success');
      reset();
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['rooms'] });
      if (room?.id) navigate(`/rooms/${room.id}`);
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Study rooms</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New room
        </Button>
      </header>

      {rooms.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : rooms.data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {rooms.data.map(({ room, role }) => (
            <Card key={room.id} className="transition hover:-translate-y-0.5">
              <CardBody className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => navigate(`/rooms/${room.id}`)} className="min-w-0 text-left">
                    <p className="truncate font-semibold">{room.name}</p>
                    {room.subject && <p className="text-sm text-content-muted">{room.subject}</p>}
                  </button>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={role === 'host' ? 'brand' : 'neutral'}>{role}</Badge>
                    {room.closed_at && <Badge tone="warn">closed</Badge>}
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardBody>
            <EmptyState
              icon={BookOpen}
              title="No study rooms yet"
              description="Open a room to study a shared document together in real time."
              action={
                <Button size="sm" onClick={() => setOpen(true)}>
                  Create a room
                </Button>
              }
            />
          </CardBody>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New study room"
        description="Give it a name and an optional subject."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={isSubmitting || create.isPending} onClick={handleSubmit((v) => create.mutate(v))}>
              Create room
            </Button>
          </>
        }
      >
        <form className="space-y-3" onSubmit={handleSubmit((v) => create.mutate(v))}>
          <Input label="Room name" error={errors.name?.message} {...register('name')} />
          <Input label="Subject" placeholder="Chemistry" {...register('subject')} />
        </form>
      </Modal>
    </div>
  );
}
