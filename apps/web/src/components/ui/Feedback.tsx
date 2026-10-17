import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-content-muted', className)} aria-hidden="true" />;
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'brand' | 'success' | 'warn' | 'danger';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface-muted text-content-muted',
    brand: 'bg-brand-500/15 text-brand-500',
    success: 'bg-emerald-500/15 text-emerald-500',
    warn: 'bg-amber-500/15 text-amber-500',
    danger: 'bg-rose-500/15 text-rose-500',
  } as const;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-2xl bg-surface-muted p-3">
        <Icon className="h-6 w-6 text-content-muted" aria-hidden={true} />
      </div>
      <div>
        <p className="font-medium text-content">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-content-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center" role="alert">
      <div className="rounded-2xl bg-rose-500/10 p-3">
        <AlertTriangle className="h-6 w-6 text-rose-500" aria-hidden="true" />
      </div>
      <div>
        <p className="font-medium text-content">{title}</p>
        {message && <p className="mt-1 max-w-sm text-sm text-content-muted">{message}</p>}
      </div>
      {onRetry && (
        <button onClick={onRetry} className="text-sm font-medium text-brand-500 hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-surface-muted', className)} aria-hidden="true" />;
}

export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return src ? (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className={cn('rounded-full object-cover', className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={cn('inline-flex items-center justify-center rounded-full bg-brand-600 font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials || '?'}
    </span>
  );
}
