import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { ApiRequestError } from '@/lib/api';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
type Form = z.infer<typeof schema>;

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
      navigate(from, { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiRequestError ? err.message : err instanceof Error ? err.message : 'Sign in failed';
      setFormError(message);
      toast(message, 'error');
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-medium text-brand-500 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError && (
          <div role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
            {formError}
          </div>
        )}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          leading={<Mail className="h-4 w-4" aria-hidden="true" />}
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          leading={<Lock className="h-4 w-4" aria-hidden="true" />}
          error={errors.password?.message}
          {...register('password')}
        />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-brand-500 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={isSubmitting} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
