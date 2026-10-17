import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

type Mode = 'focus' | 'short_break' | 'long_break';

const DURATIONS: Record<Mode, number> = { focus: 25 * 60, short_break: 5 * 60, long_break: 15 * 60 };

export default function Focus() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('focus');
  const [target, setTarget] = useState(DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Wall-clock anchor. Elapsed is derived from real timestamps, so a suspended
  // tab or sleeping device cannot corrupt the duration.
  const startedAtRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);

  const record = useMutation({
    mutationFn: async (payload: { mode: Mode; seconds: number; startedAt: string; endedAt: string }) => {
      const { error } = await supabase.from('study_sessions').insert({
        user_id: user!.id,
        mode: payload.mode,
        duration_sec: payload.seconds,
        started_at: payload.startedAt,
        ended_at: payload.endedAt,
      });
      if (error) throw error;
    },
  });

  useEffect(() => {
    if (!running) return;
    startedAtRef.current = Date.now();
    const id = window.setInterval(() => {
      const base = accumulatedRef.current;
      const live = startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0;
      setElapsed(base + live);
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  const remaining = Math.max(0, target - Math.floor(elapsed));
  const progress = useMemo(() => Math.min(1, elapsed / target), [elapsed, target]);

  function complete() {
    const seconds = Math.min(Math.floor(elapsed), target);
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - seconds * 1000);
    if (seconds >= 60 && mode === 'focus') {
      record.mutate(
        { mode, seconds, startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() },
        { onSuccess: () => toast('Focus session saved', 'success') },
      );
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(mode === 'focus' ? 'Focus session complete' : 'Break over', {
        body: 'Time to switch.',
      });
    }
    setRunning(false);
    setElapsed(0);
    accumulatedRef.current = 0;
    startedAtRef.current = null;
  }

  useEffect(() => {
    if (running && remaining === 0) complete();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, running]);

  function pause() {
    accumulatedRef.current = elapsed;
    startedAtRef.current = null;
    setRunning(false);
  }

  function reset() {
    setRunning(false);
    setElapsed(0);
    accumulatedRef.current = 0;
    startedAtRef.current = null;
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Focus timer</h1>

      <Card>
        <CardBody className="flex flex-col items-center gap-6 py-10">
          <div className="flex gap-2" role="radiogroup" aria-label="Timer mode">
            {(['focus', 'short_break', 'long_break'] as Mode[]).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                onClick={() => {
                  setMode(m);
                  setTarget(DURATIONS[m]);
                  reset();
                }}
                className={cn(
                  'rounded-xl px-3 py-1.5 text-sm font-medium transition',
                  mode === m ? 'bg-brand-600 text-white' : 'bg-surface-muted text-content-muted',
                )}
              >
                {m === 'focus' ? 'Focus' : m === 'short_break' ? 'Short break' : 'Long break'}
              </button>
            ))}
          </div>

          <div className="relative grid h-52 w-52 place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r="45" fill="none" strokeWidth="6" className="stroke-surface-muted" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                className="stroke-brand-500 transition-[stroke-dashoffset] duration-300"
                strokeDasharray={2 * Math.PI * 45}
                strokeDashoffset={2 * Math.PI * 45 * (1 - progress)}
              />
            </svg>
            <span className="font-mono text-5xl font-semibold tabular-nums" aria-live="polite">
              {mm}:{ss}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {running ? (
              <Button onClick={pause}>
                <Pause className="h-4 w-4" aria-hidden="true" /> Pause
              </Button>
            ) : (
              <Button
                onClick={() => {
                  if ('Notification' in window && Notification.permission === 'default') {
                    // Only ask in context, right before it would be useful.
                    void Notification.requestPermission();
                  }
                  setRunning(true);
                }}
              >
                <Play className="h-4 w-4" aria-hidden="true" /> {elapsed > 0 ? 'Resume' : 'Start'}
              </Button>
            )}
            <Button variant="secondary" onClick={reset}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset
            </Button>
          </div>

          <div className="w-full max-w-xs">
            <Select
              label="Custom focus length"
              value={target}
              onChange={(e) => {
                setTarget(Number(e.target.value));
                reset();
              }}
              disabled={running}
            >
              {[15, 20, 25, 30, 45, 50].map((m) => (
                <option key={m} value={m * 60}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </div>
        </CardBody>
      </Card>

      <p className="text-center text-xs text-content-muted">
        Completed focus sessions are saved to your account. Browser notifications only fire while the
        app is open — a suspended tab or a closed PWA cannot alert you.
      </p>
    </div>
  );
}
