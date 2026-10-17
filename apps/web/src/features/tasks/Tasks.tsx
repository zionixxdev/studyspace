import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarDays, Check, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { cn } from '@/lib/utils';
import { createTaskSchema, type Task } from '@studyspace/shared';

type Form = z.infer<typeof createTaskSchema>;

const priorityTone = {
  low: 'neutral',
  medium: 'brand',
  high: 'warn',
  urgent: 'danger',
} as const;

export default function Tasks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const tasks = useQuery({
    queryKey: ['tasks', showCompleted],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('tasks').select('*').order('due_at', { ascending: true, nullsFirst: false });
      q = showCompleted ? q.not('completed_at', 'is', null) : q.is('completed_at', null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Task[];
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(createTaskSchema) });

  const create = useMutation({
    mutationFn: async (values: Form) => {
      const { error } = await supabase.from('tasks').insert({
        owner_id: user!.id,
        title: values.title,
        notes: values.notes ?? null,
        subject: values.subject ?? null,
        priority: values.priority,
        due_at: values.dueAt ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('Task added', 'success');
      reset();
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-tasks'] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ completed_at: done ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks & planner</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowCompleted((v) => !v)}>
            {showCompleted ? 'Show open' : 'Show done'}
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add task
          </Button>
        </div>
      </header>

      <Card>
        <CardBody className="pt-4">
          {tasks.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : tasks.data?.length ? (
            <ul className="divide-y divide-surface-border">
              {tasks.data.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <button
                    onClick={() => toggle.mutate({ id: t.id, done: !t.completed_at })}
                    aria-label={t.completed_at ? `Reopen ${t.title}` : `Complete ${t.title}`}
                    className={cn(
                      'grid h-6 w-6 shrink-0 place-items-center rounded-full border transition',
                      t.completed_at
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-surface-border hover:border-brand-400',
                    )}
                  >
                    {t.completed_at && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-medium', t.completed_at && 'line-through text-content-muted')}>
                      {t.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-content-muted">
                      {t.subject && <span>{t.subject}</span>}
                      {t.due_at && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" aria-hidden="true" />
                          {new Date(t.due_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge tone={priorityTone[t.priority]}>{t.priority}</Badge>
                  <button
                    onClick={() => remove.mutate(t.id)}
                    aria-label={`Delete ${t.title}`}
                    className="rounded-lg p-1.5 text-content-muted hover:bg-surface-muted hover:text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title={showCompleted ? 'Nothing completed yet' : 'No open tasks'}
              description="Tasks keep your deadlines and revision goals in one place."
              action={
                <Button size="sm" onClick={() => setOpen(true)}>
                  Add your first task
                </Button>
              }
            />
          )}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New task"
        description="Add a deadline, a priority and a subject."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={isSubmitting || create.isPending} onClick={handleSubmit((v) => create.mutate(v))}>
              Add task
            </Button>
          </>
        }
      >
        <form className="space-y-3" onSubmit={handleSubmit((v) => create.mutate(v))}>
          <Input label="Title" error={errors.title?.message} {...register('title')} />
          <Textarea label="Notes" rows={3} {...register('notes')} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Subject" placeholder="Physics" {...register('subject')} />
            <Select label="Priority" {...register('priority')}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </div>
          <Input label="Due date" type="datetime-local" {...register('dueAt')} />
        </form>
      </Modal>
    </div>
  );
}
