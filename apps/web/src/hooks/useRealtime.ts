import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

type Handler = (payload: unknown) => void;

/**
 * Subscribes to Postgres changes on a table and calls `onChange` for each event.
 * Cleanup is guaranteed on unmount / dependency change so we never leak a
 * channel (a common Realtime pitfall on mobile).
 */
export function useRealtimeTable(
  table: string,
  filter: string | undefined,
  onChange: Handler,
  enabled = true,
) {
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    const channelName = `${table}:${filter ?? 'all'}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload) => handlerRef.current(payload),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, filter, enabled]);
}

/** Ephemeral presence/broadcast channel for typing indicators and cursors. */
export function useBroadcast(channelName: string, event: string, onMessage: Handler) {
  const ref = useRef(onMessage);
  ref.current = onMessage;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase.channel(channelName, { config: { broadcast: { self: false } } });
    channel.on('broadcast', { event }, (msg) => ref.current(msg.payload)).subscribe();
    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [channelName, event]);

  return (payload: unknown) => {
    void channelRef.current?.send({ type: 'broadcast', event, payload });
  };
}
