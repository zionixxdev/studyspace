import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Theme } from '@/types/db';

interface ThemeValue {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);
const THEME_KEY = 'ss.theme';
const MOTION_KEY = 'ss.reducedMotion';

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) as Theme | null) ?? 'system',
  );
  const [reducedMotion, setMotionState] = useState<boolean>(
    () => localStorage.getItem(MOTION_KEY) === 'true',
  );
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.dataset.reducedMotion = String(reducedMotion);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0b1020' : '#4f46e5');
  }, [resolved, reducedMotion]);

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem(THEME_KEY, t);
    setThemeState(t);
  }, []);
  const setReducedMotion = useCallback((v: boolean) => {
    localStorage.setItem(MOTION_KEY, String(v));
    setMotionState(v);
  }, []);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, reducedMotion, setReducedMotion }),
    [theme, resolved, setTheme, reducedMotion, setReducedMotion],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
