import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });
type Form = z.infer<typeof schema>;

export function ResetPassword() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    setFormError(null);
    try {
      await updatePassword(values.password);
      toast('Password updated', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not update password');
    }
  }

  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {formError && (
          <div role="alert" className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
            {formError}
          </div>
        )}
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          leading={<Lock className="h-4 w-4" aria-hidden="true" />}
          error={errors.password?.message}
          {...register('password')}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          leading={<Lock className="h-4 w-4" aria-hidden="true" />}
          error={errors.confirm?.message}
          {...register('confirm')}
        />
        <Button type="submit" loading={isSubmitting} className="w-full">
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
