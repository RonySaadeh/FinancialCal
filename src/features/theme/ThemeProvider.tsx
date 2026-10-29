import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Theme } from '../../lib/types';

const KEY = 'financial-cal.theme';

interface ThemeState {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

/** Theme preference is a per-device convenience, also saved to the profile when signed in. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem(KEY);
      return t === 'light' || t === 'dark' || t === 'system' ? t : 'system';
    } catch {
      return 'system';
    }
  });
  const [sysDark, setSysDark] = useState(systemDark);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const fn = () => setSysDark(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const resolved: 'light' | 'dark' = theme === 'system' ? (sysDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const value = useMemo(() => ({
    theme,
    resolved,
    setTheme: (t: Theme) => {
      setThemeState(t);
      try {
        localStorage.setItem(KEY, t);
      } catch {
        /* ignore */
      }
    }
  }), [theme, resolved]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
