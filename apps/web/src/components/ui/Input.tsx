import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leading?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leading, className, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <div>
      {label && (
        <label className="ss-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className="relative">
        {leading && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-muted">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn('ss-input', leading && 'pl-9', error && 'border-rose-500', className)}
          {...rest}
        />
      </div>
      {error ? (
        <p className="ss-error" id={`${inputId}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="ss-hint" id={`${inputId}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }
>(function Textarea({ label, error, className, id, ...rest }, ref) {
  const inputId = id ?? rest.name;
  return (
    <div>
      {label && (
        <label className="ss-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={cn('ss-input min-h-[90px] resize-y', error && 'border-rose-500', className)}
        {...rest}
      />
      {error && <p className="ss-error">{error}</p>}
    </div>
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }
>(function Select({ label, error, className, id, children, ...rest }, ref) {
  const inputId = id ?? rest.name;
  return (
    <div>
      {label && (
        <label className="ss-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <select ref={ref} id={inputId} className={cn('ss-input', error && 'border-rose-500', className)} {...rest}>
        {children}
      </select>
      {error && <p className="ss-error">{error}</p>}
    </div>
  );
});
