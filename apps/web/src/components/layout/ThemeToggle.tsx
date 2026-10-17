import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

const options = [
  { value: 'light', label: 'Light theme', Icon: Sun },
  { value: 'dark', label: 'Dark theme', Icon: Moon },
  { value: 'system', label: 'System theme', Icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="glass inline-flex rounded-xl p-0.5" role="radiogroup" aria-label="Colour theme">
      {options.map(({ value, label, Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            'rounded-lg p-2 transition',
            theme === value ? 'bg-brand-600 text-white' : 'text-content-muted hover:text-content',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
