import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type Form = z.infer<typeof schema>;

export function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    await resetPassword(values.email);
    setSent(true);
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a secure link to choose a new one."
      footer={
        <Link to="/login" className="font-medium text-brand-500 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div role="status" className="rounded-xl bg-emerald-500/10 px-3 py-3 text-sm text-emerald-600">
          If an account exists for that address, a reset link is on its way. Check your inbox and spam
          folder.
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            leading={<Mail className="h-4 w-4" aria-hidden="true" />}
            error={errors.email?.message}
            {...register('email')}
          />
          <Button type="submit" loading={isSubmitting} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
