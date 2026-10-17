import { cn } from '@/lib/utils';

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass rounded-2xl shadow-glass', className)} {...rest} />;
}

export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-3 px-4 py-3', className)} {...rest} />;
}

export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-semibold text-content', className)} {...rest} />;
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pb-4', className)} {...rest} />;
}
