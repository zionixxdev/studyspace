import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { LogOut, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useToast } from '@/components/ui/Toast';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { updateProfileSchema } from '@studyspace/shared';

type Form = z.infer<typeof updateProfileSchema>;

export default function Settings() {
  const { user, profile, signOut, refreshProfile, updatePassword } = useAuth();
  const { reducedMotion, setReducedMotion } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      username: profile?.username,
      displayName: profile?.display_name,
      bio: profile?.bio ?? '',
    },
  });

  const saveProfile = useMutation({
    mutationFn: async (values: Form) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          username: values.username,
          display_name: values.displayName,
          bio: values.bio || null,
        })
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      toast('Profile updated', 'success');
    },
    onError: (e: Error) => toast(e.message.includes('duplicate') ? 'That username is taken' : e.message, 'error'),
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      // The API removes owned Drive files, then deletes the auth user.
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? '/api/v1'}/me`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      if (!res.ok && res.status !== 204) throw new Error('Could not delete your account');
    },
    onSuccess: async () => {
      await signOut();
      navigate('/login');
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardBody>
          <form className="space-y-3" onSubmit={handleSubmit((v) => saveProfile.mutate(v))}>
            <Input label="Display name" error={errors.displayName?.message} {...register('displayName')} />
            <Input label="Username" error={errors.username?.message} {...register('username')} />
            <Textarea label="Bio" rows={3} {...register('bio')} />
            <Button type="submit" loading={saveProfile.isPending}>
              Save profile
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Theme</span>
            <ThemeToggle />
          </div>
          <label className="flex items-center justify-between text-sm">
            Reduce motion
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
              className="h-4 w-4 rounded border-surface-border"
            />
          </label>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            hint="At least 8 characters."
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={newPassword.length < 8}
              onClick={async () => {
                try {
                  await updatePassword(newPassword);
                  setNewPassword('');
                  toast('Password updated', 'success');
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'Could not update password', 'error');
                }
              }}
            >
              Update password
            </Button>
            <Button variant="ghost" onClick={() => signOut().then(() => navigate('/login'))}>
              <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card className="border-rose-500/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-500">
            <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Danger zone
          </CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-content-muted">
            Deleting your account removes your profile, messages and shared content, and deletes the
            files you own from Drive. This cannot be undone.
          </p>
          <Button variant="danger" className="mt-3" onClick={() => setConfirmDelete(true)}>
            Delete my account
          </Button>
        </CardBody>
      </Card>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete your account?"
        description="This is permanent. Type DELETE to confirm."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleteText !== 'DELETE'}
              loading={deleteAccount.isPending}
              onClick={() => deleteAccount.mutate()}
            >
              Delete account
            </Button>
          </>
        }
      >
        <Input
          label="Type DELETE to confirm"
          value={deleteText}
          onChange={(e) => setDeleteText(e.target.value)}
        />
      </Modal>
    </div>
  );
}
