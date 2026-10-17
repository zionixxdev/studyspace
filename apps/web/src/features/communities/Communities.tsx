import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Plus, UsersRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { createGroupSchema, type Group } from '@studyspace/shared';

type Form = z.infer<typeof createGroupSchema>;

export default function Communities() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'discover' | 'mine'>('mine');

  const groups = useQuery({
    queryKey: ['groups', tab],
    enabled: !!user,
    queryFn: async (): Promise<Group[]> => {
      if (tab === 'mine') {
        const { data, error } = await supabase
          .from('group_members')
          .select('role, groups(*)')
          .eq('user_id', user!.id);
        if (error) throw error;
        return (data ?? []).map((r) => (r as unknown as { groups: Group }).groups);
      }
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Group[];
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(createGroupSchema) });

  const create = useMutation({
    mutationFn: async (values: Form) => {
      const { error } = await supabase.rpc('create_group', {
        p_name: values.name,
        p_description: values.description ?? null,
        p_visibility: values.visibility,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('Community created', 'success');
      reset();
      setOpen(false);
      setTab('mine');
      void qc.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const join = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('join_public_group', { p_group_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('Joined community', 'success');
      void qc.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Communities</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New community
        </Button>
      </header>

      <div className="flex gap-2" role="tablist">
        {(['mine', 'discover'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? 'rounded-full bg-brand-600 px-3 py-1 text-sm font-medium text-white'
                : 'rounded-full bg-surface-muted px-3 py-1 text-sm font-medium text-content-muted'
            }
          >
            {t === 'mine' ? 'My communities' : 'Discover'}
          </button>
        ))}
      </div>

      {groups.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : groups.data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.data.map((g) => (
            <Card key={g.id} className="transition hover:-translate-y-0.5">
              <CardBody className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/communities/${g.id}`} className="min-w-0">
                    <p className="truncate font-semibold">{g.name}</p>
                    {g.description && <p className="mt-0.5 line-clamp-2 text-sm text-content-muted">{g.description}</p>}
                  </Link>
                  <Badge tone={g.visibility === 'private' ? 'warn' : 'brand'}>{g.visibility}</Badge>
                </div>
                {tab === 'discover' && (
                  <Button size="sm" variant="secondary" className="mt-3" onClick={() => join.mutate(g.id)}>
                    Join
                  </Button>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardBody>
            <EmptyState
              icon={UsersRound}
              title={tab === 'mine' ? 'No communities yet' : 'Nothing to discover'}
              description="Create one for your class, or join a public community."
              action={
                <Button size="sm" onClick={() => (tab === 'mine' ? setOpen(true) : setTab('discover'))}>
                  {tab === 'mine' ? 'Create a community' : 'Discover communities'}
                </Button>
              }
            />
          </CardBody>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New community"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={isSubmitting || create.isPending} onClick={handleSubmit((v) => create.mutate(v))}>
              Create
            </Button>
          </>
        }
      >
        <form className="space-y-3" onSubmit={handleSubmit((v) => create.mutate(v))}>
          <Input label="Name" error={errors.name?.message} {...register('name')} />
          <Textarea label="Description" rows={3} {...register('description')} />
          <Select label="Visibility" {...register('visibility')}>
            <option value="public">Public — anyone can join</option>
            <option value="private">Private — invite only</option>
          </Select>
        </form>
      </Modal>
    </div>
  );
}
