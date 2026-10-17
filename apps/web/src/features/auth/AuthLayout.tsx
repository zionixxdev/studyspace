import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 font-bold text-white">
              S
            </span>
            <span className="text-xl font-semibold tracking-tight">StudySpace</span>
          </Link>
          <ThemeToggle />
        </div>
        <div className="glass rounded-2xl p-6 shadow-glass">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-content-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-content-muted">{footer}</div>}
      </div>
    </div>
  );
}
