import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeTable } from '@/hooks/useRealtime';
import type { Annotation } from './AnnotationLayer';

/**
 * Loads and mutates annotations for a file. Annotations live in Postgres (not
 * only in component state) so they survive a reload and are shared with anyone
 * who has access. When a roomId is given they are also synced live.
 */
export function useAnnotations(fileId: string | null, roomId: string | null) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ['annotations', fileId, roomId];

  const list = useQuery({
    queryKey: key,
    enabled: !!fileId,
    queryFn: async (): Promise<Annotation[]> => {
      let q = supabase.from('annotations').select('*').eq('file_id', fileId!).is('deleted_at', null);
      q = roomId ? q.eq('room_id', roomId) : q.is('room_id', null);
      const { data, error } = await q.order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Annotation[];
    },
  });

  // Shared annotations update live for everyone in the room.
  useRealtimeTable(
    'annotations',
    roomId ? `room_id=eq.${roomId}` : undefined,
    () => void qc.invalidateQueries({ queryKey: key }),
    !!roomId,
  );

  const create = useMutation({
    mutationFn: async (input: {
      page: number;
      type: Annotation['type'];
      geometry: Record<string, unknown>;
      color: string;
      text?: string;
    }) => {
      const { error } = await supabase.from('annotations').insert({
        file_id: fileId,
        room_id: roomId,
        author_id: user!.id,
        page: input.page,
        type: input.type,
        geometry: input.geometry,
        color: input.color,
        text: input.text ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('annotations')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  return { list, create, remove };
}
