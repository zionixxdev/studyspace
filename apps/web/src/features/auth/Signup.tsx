import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { AtSign, Mail, Lock, User } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { usernameSchema } from '@studyspace/shared';

const schema = z.object({
  displayName: z.string().trim().min(1, 'Tell us your name').max(80),
  username: usernameSchema,
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters'),
});
type Form = z.infer<typeof schema>;

export function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    setFormError(null);
    try {
      const { needsVerification } = await signUp(
        values.email,
        values.password,
        values.username,
        values.displayName,
      );
      navigate(needsVerification ? '/verify-email' : '/', { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sign up failed');
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="A distraction-free place to study together."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-500 hover:underline">
            Sign in
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
          label="Display name"
          autoComplete="name"
          leading={<User className="h-4 w-4" aria-hidden="true" />}
          error={errors.displayName?.message}
          {...register('displayName')}
        />
        <Input
          label="Username"
          autoComplete="username"
          leading={<AtSign className="h-4 w-4" aria-hidden="true" />}
          hint="Letters, numbers and underscores. This is how friends find you."
          error={errors.username?.message}
          {...register('username')}
        />
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
          autoComplete="new-password"
          leading={<Lock className="h-4 w-4" aria-hidden="true" />}
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={isSubmitting} className="w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
