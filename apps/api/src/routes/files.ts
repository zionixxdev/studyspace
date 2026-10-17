import { Router } from 'express';
import multer from 'multer';
import { createReadStream, promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, userId } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadLimiter, writeLimiter } from '../middleware/rateLimit.js';
import { initUploadSchema, shareFileSchema, LIMITS, ALLOWED_DOCUMENT_MIME } from '@studyspace/shared';
import { ApiError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.js';
import { resolveFileAccess, isConversationMember, isGroupMember, isRoomMember } from '../services/authorization/access.js';
import { deleteFile, downloadStream, renameFile, uploadStream, getStorageQuota } from '../services/google-drive/client.js';
import { z } from 'zod';

export const filesRouter = Router();
filesRouter.use(requireAuth);

// Buffer uploads to a temp file on disk, then stream to Drive. This keeps large
// files out of server memory.
const upload = multer({
  dest: '/tmp/studyspace-uploads',
  limits: { fileSize: LIMITS.MAX_FILE_BYTES, files: 1 },
});

/** Sums a user's completed uploads to enforce the per-user budget. */
async function currentUsage(ownerId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('drive_files')
    .select('size_bytes')
    .eq('owner_id', ownerId)
    .eq('upload_state', 'completed')
    .is('deleted_at', null);
  return (data ?? []).reduce((sum, r) => sum + Number(r.size_bytes ?? 0), 0);
}

/** Verifies the user may place a file into the requested scope. */
async function assertScopeAllowed(scope: string, scopeId: string | null | undefined, uid: string) {
  if (scope === 'private' || scope === 'user') return;
  if (!scopeId) throw ApiError.badRequest('A destination id is required for this scope');
  const ok =
    (scope === 'conversation' && (await isConversationMember(scopeId, uid))) ||
    (scope === 'group' && (await isGroupMember(scopeId, uid))) ||
    (scope === 'room' && (await isRoomMember(scopeId, uid)));
  if (!ok) throw ApiError.forbidden('You cannot upload into that destination');
}

/** Upload a file: validates, records a pending row, streams to Drive, finalises. */
filesRouter.post(
  '/files/uploads',
  uploadLimiter,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (!req.file) throw ApiError.badRequest('No file provided');

    const tempPath = req.file.path;
    try {
      const meta = initUploadSchema.parse({
        name: req.body.name || req.file.originalname,
        mime: req.file.mimetype,
        sizeBytes: req.file.size,
        scope: req.body.scope || 'private',
        scopeId: req.body.scopeId || null,
        idempotencyKey: req.body.idempotencyKey || randomUUID(),
      });

      if (!ALLOWED_DOCUMENT_MIME.includes(meta.mime as (typeof ALLOWED_DOCUMENT_MIME)[number])) {
        throw ApiError.badRequest(`Unsupported file type: ${meta.mime}`);
      }
      await assertScopeAllowed(meta.scope, meta.scopeId, uid);

      // Idempotency: a retried request with the same key returns the original.
      const { data: existing } = await supabaseAdmin
        .from('uploads')
        .select('file_id, state, drive_files(drive_file_id, name, mime, size_bytes, upload_state)')
        .eq('owner_id', uid)
        .eq('idempotency_key', meta.idempotencyKey)
        .maybeSingle();
      if (existing) {
        res.status(200).json({ file: (existing as { drive_files: unknown }).drive_files, deduplicated: true });
        return;
      }

      const used = await currentUsage(uid);
      if (used + meta.sizeBytes > LIMITS.PER_USER_STORAGE_BYTES) {
        throw new ApiError(507, 'storage_limit', 'You have reached your storage limit');
      }

      // 1. Pending file + upload records.
      const { data: fileRow, error: fileErr } = await supabaseAdmin
        .from('drive_files')
        .insert({
          owner_id: uid,
          name: meta.name,
          mime: meta.mime,
          size_bytes: meta.sizeBytes,
          scope: meta.scope,
          scope_id: meta.scopeId,
          upload_state: 'uploading',
        })
        .select()
        .single();
      if (fileErr || !fileRow) throw ApiError.internal('Could not create the upload record');

      await supabaseAdmin.from('uploads').insert({
        file_id: fileRow.id,
        owner_id: uid,
        idempotency_key: meta.idempotencyKey,
        state: 'uploading',
      });

      try {
        // 2. Stream to the central Drive account.
        const result = await uploadStream({
          stream: createReadStream(tempPath),
          name: meta.name,
          mime: meta.mime,
        });

        // 3. Finalise.
        const { data: final } = await supabaseAdmin
          .from('drive_files')
          .update({
            drive_file_id: result.driveFileId,
            size_bytes: result.sizeBytes || meta.sizeBytes,
            upload_state: 'completed',
          })
          .eq('id', fileRow.id)
          .select()
          .single();

        await supabaseAdmin
          .from('uploads')
          .update({ state: 'completed', bytes_received: result.sizeBytes || meta.sizeBytes })
          .eq('file_id', fileRow.id);

        await audit({ actorId: uid, action: 'file.upload', entityType: 'file', entityId: fileRow.id, metadata: { mime: meta.mime, size: meta.sizeBytes } });
        res.status(201).json({ file: final });
      } catch (err) {
        // Mark the attempt failed so the UI can offer a retry; leave no orphan.
        await supabaseAdmin.from('drive_files').update({ upload_state: 'failed' }).eq('id', fileRow.id);
        await supabaseAdmin.from('uploads').update({ state: 'failed', error: String(err) }).eq('file_id', fileRow.id);
        throw err;
      }
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }),
);

/** Files visible to the caller: owned, plus anything shared with a scope they belong to. */
filesRouter.get(
  '/files',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const limit = Math.min(Number(req.query.limit) || 30, 100);

    const { data: owned } = await supabaseAdmin
      .from('drive_files')
      .select('*')
      .eq('owner_id', uid)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    const { data: memberships } = await supabaseAdmin
      .from('file_shares')
      .select('file_id, scope, scope_id, permission, drive_files(*)')
      .is('revoked_at', null);

    // Filter shares to those the caller actually belongs to.
    const shared: unknown[] = [];
    for (const s of memberships ?? []) {
      const ok =
        (s.scope === 'user' && s.scope_id === uid) ||
        (s.scope === 'conversation' && (await isConversationMember(s.scope_id, uid))) ||
        (s.scope === 'group' && (await isGroupMember(s.scope_id, uid))) ||
        (s.scope === 'room' && (await isRoomMember(s.scope_id, uid)));
      if (ok && s.drive_files) shared.push(s.drive_files);
    }

    const seen = new Set<string>();
    const items = [...(owned ?? []), ...(shared as { id: string }[])].filter((f) => {
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });

    res.json({ items });
  }),
);

filesRouter.get(
  '/files/storage',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const used = await currentUsage(uid);
    let drive: { limit: number | null; usage: number | null } = { limit: null, usage: null };
    try {
      drive = await getStorageQuota();
    } catch {
      // Drive unavailable is not fatal for a usage summary.
    }
    res.json({ usedBytes: used, perUserLimitBytes: LIMITS.PER_USER_STORAGE_BYTES, drive });
  }),
);

filesRouter.get(
  '/files/:id',
  asyncHandler(async (req, res) => {
    const { file } = await resolveFileAccess(req.params.id!, userId(req));
    res.json(file);
  }),
);

/** Streams file content through the API — never a public Drive link. */
filesRouter.get(
  '/files/:id/content',
  asyncHandler(async (req, res) => {
    const { file } = await resolveFileAccess(req.params.id!, userId(req));
    if (!file.drive_file_id) throw ApiError.notFound('This file has no stored content');

    const stream = await downloadStream(file.drive_file_id);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }),
);

filesRouter.patch(
  '/files/:id',
  writeLimiter,
  validate({ body: z.object({ name: z.string().trim().min(1).max(255).optional(), archived: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { file, canEdit } = await resolveFileAccess(req.params.id!, uid);
    if (!canEdit) throw ApiError.forbidden('You cannot modify this file');

    if (req.body.name && file.drive_file_id) await renameFile(file.drive_file_id, req.body.name);

    const { data } = await supabaseAdmin
      .from('drive_files')
      .update({
        ...(req.body.name ? { name: req.body.name } : {}),
        ...(req.body.archived !== undefined ? { archived_at: req.body.archived ? new Date().toISOString() : null } : {}),
      })
      .eq('id', file.id)
      .select()
      .single();
    res.json(data);
  }),
);

filesRouter.delete(
  '/files/:id',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { file } = await resolveFileAccess(req.params.id!, uid);
    if (file.owner_id !== uid) throw ApiError.forbidden('Only the owner may delete this file');

    await supabaseAdmin.from('drive_files').update({ upload_state: 'deleting' }).eq('id', file.id);
    if (file.drive_file_id) {
      try {
        await deleteFile(file.drive_file_id);
      } catch {
        // Continue: mark deleted locally even if Drive is briefly unavailable.
      }
    }
    await supabaseAdmin.from('drive_files').update({ deleted_at: new Date().toISOString(), upload_state: 'completed' }).eq('id', file.id);
    await audit({ actorId: uid, action: 'file.delete', entityType: 'file', entityId: file.id });
    res.status(204).end();
  }),
);

filesRouter.post(
  '/files/:id/shares',
  writeLimiter,
  validate({ body: shareFileSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { file } = await resolveFileAccess(req.params.id!, uid);
    if (file.owner_id !== uid) throw ApiError.forbidden('Only the owner may share this file');

    const { data, error } = await supabaseAdmin
      .from('file_shares')
      .upsert(
        {
          file_id: file.id,
          created_by: uid,
          scope: req.body.scope,
          scope_id: req.body.scopeId,
          permission: req.body.permission,
          expires_at: req.body.expiresAt ?? null,
          revoked_at: null,
        },
        { onConflict: 'file_id,scope,scope_id' },
      )
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);
    res.status(201).json(data);
  }),
);

filesRouter.delete(
  '/files/:id/shares/:shareId',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { file } = await resolveFileAccess(req.params.id!, uid);
    if (file.owner_id !== uid) throw ApiError.forbidden('Only the owner may change sharing');

    const { error } = await supabaseAdmin
      .from('file_shares')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', req.params.shareId!)
      .eq('file_id', file.id);
    if (error) throw ApiError.internal(error.message);
    res.status(204).end();
  }),
);
