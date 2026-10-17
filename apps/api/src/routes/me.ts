import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, userId } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateProfileSchema, updateSettingsSchema, usernameSchema } from '@studyspace/shared';
import { ApiError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.js';
import { deleteFile } from '../services/google-drive/client.js';
import { z } from 'zod';

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const id = userId(req);
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*, user_settings(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw ApiError.internal();
    if (!data) throw ApiError.notFound('Profile not found');
    res.json(data);
  }),
);

meRouter.patch(
  '/me/profile',
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req, res) => {
    const id = userId(req);
    const body = req.body as z.infer<typeof updateProfileSchema>;

    // Uniqueness is enforced by the DB; surface a clean 409 rather than a 500.
    if (body.username) {
      const { data: clash } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('username', body.username)
        .neq('id', id)
        .maybeSingle();
      if (clash) throw ApiError.conflict('That username is taken');
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({
        ...(body.username ? { username: body.username } : {}),
        ...(body.displayName ? { display_name: body.displayName } : {}),
        ...(body.bio !== undefined ? { bio: body.bio } : {}),
        ...(body.avatarUrl !== undefined ? { avatar_url: body.avatarUrl } : {}),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);
    res.json(data);
  }),
);

meRouter.patch(
  '/me/settings',
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req, res) => {
    const id = userId(req);
    const body = req.body as z.infer<typeof updateSettingsSchema>;
    const { data, error } = await supabaseAdmin
      .from('user_settings')
      .update({
        ...(body.theme ? { theme: body.theme } : {}),
        ...(body.notifyEmail !== undefined ? { notify_email: body.notifyEmail } : {}),
        ...(body.notifyPush !== undefined ? { notify_push: body.notifyPush } : {}),
        ...(body.profileVisibility ? { profile_visibility: body.profileVisibility } : {}),
        ...(body.reducedMotion !== undefined ? { reduced_motion: body.reducedMotion } : {}),
      })
      .eq('user_id', id)
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);
    res.json(data);
  }),
);

/** Public profile view, respecting visibility + blocks. */
meRouter.get(
  '/profiles/:username',
  asyncHandler(async (req, res) => {
    const viewer = userId(req);
    const username = usernameSchema.parse(req.params.username!);
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, created_at')
      .ilike('username', username)
      .maybeSingle();
    if (!profile) throw ApiError.notFound('No such user');

    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('profile_visibility')
      .eq('user_id', profile.id)
      .maybeSingle();

    const visibility = settings?.profile_visibility ?? 'public';
    const isSelf = profile.id === viewer;

    if (!isSelf) {
      const { data: block } = await supabaseAdmin
        .from('blocks')
        .select('blocker_id')
        .or(
          `and(blocker_id.eq.${viewer},blocked_id.eq.${profile.id}),and(blocker_id.eq.${profile.id},blocked_id.eq.${viewer})`,
        )
        .maybeSingle();
      if (block) throw ApiError.notFound('No such user');
      if (visibility === 'private') {
        res.json({ id: profile.id, username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url, restricted: true });
        return;
      }
    }
    res.json({ ...profile, restricted: false });
  }),
);

/**
 * Account deletion. Removes owned Drive files first (so the central account is
 * not orphaned), then deletes the auth user — profiles and everything that
 * references it cascade.
 */
meRouter.delete(
  '/me',
  validate({ body: z.object({ confirm: z.literal('DELETE') }) }),
  asyncHandler(async (req, res) => {
    const id = userId(req);

    const { data: owned } = await supabaseAdmin
      .from('drive_files')
      .select('drive_file_id')
      .eq('owner_id', id)
      .not('drive_file_id', 'is', null);

    for (const f of owned ?? []) {
      if (f.drive_file_id) {
        try {
          await deleteFile(f.drive_file_id);
        } catch {
          // Best-effort: continue so the account can still be deleted.
        }
      }
    }

    await audit({ actorId: id, action: 'account.delete', entityType: 'user', entityId: id });

    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) throw ApiError.internal('Could not delete account');
    res.status(204).end();
  }),
);
