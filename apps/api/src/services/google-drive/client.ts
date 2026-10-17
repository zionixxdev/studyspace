import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { mapDriveError } from './errors.js';

/**
 * Central Google Drive storage.
 *
 * All files for every user live in ONE owner-controlled Drive account, inside a
 * dedicated application folder. The browser never talks to Drive and never sees
 * a Drive file id used as a capability — access is decided by our own
 * authorization service before any Drive call is made.
 *
 * Credentials: an OAuth2 client built from a long-lived refresh token held in a
 * server-side secret. The token is refreshed transparently by google-auth.
 */
const oauth2 = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI,
);
oauth2.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2 });

/** The folder that holds every uploaded file. Created on first use if absent. */
let cachedRootId: string | null = env.GOOGLE_DRIVE_ROOT_FOLDER_ID || null;

export async function getRootFolderId(): Promise<string> {
  if (cachedRootId) return cachedRootId;
  try {
    const created = await drive.files.create({
      requestBody: {
        name: 'StudySpace',
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });
    cachedRootId = created.data.id ?? null;
    if (!cachedRootId) throw new Error('Drive did not return a folder id');
    logger.info({ folderId: cachedRootId }, 'Created StudySpace root folder in Drive');
    return cachedRootId;
  } catch (err) {
    throw mapDriveError(err);
  }
}

export interface UploadResult {
  driveFileId: string;
  sizeBytes: number;
}

/**
 * Streams a file into the app folder. Uses a readable stream (not a Buffer) so
 * large uploads are not buffered entirely in server memory.
 */
export async function uploadStream(params: {
  stream: Readable;
  name: string;
  mime: string;
}): Promise<UploadResult> {
  const parent = await getRootFolderId();
  try {
    const res = await drive.files.create({
      requestBody: { name: params.name, parents: [parent] },
      media: { mimeType: params.mime, body: params.stream },
      fields: 'id, size',
    });
    if (!res.data.id) throw new Error('Drive did not return a file id');
    return { driveFileId: res.data.id, sizeBytes: Number(res.data.size ?? 0) };
  } catch (err) {
    throw mapDriveError(err);
  }
}

export async function downloadStream(driveFileId: string): Promise<Readable> {
  try {
    const res = await drive.files.get(
      { fileId: driveFileId, alt: 'media' },
      { responseType: 'stream' },
    );
    return res.data as unknown as Readable;
  } catch (err) {
    throw mapDriveError(err);
  }
}

export async function getFileMeta(driveFileId: string): Promise<{ id: string; name: string; mimeType: string; size: number }> {
  try {
    const res = await drive.files.get({
      fileId: driveFileId,
      fields: 'id, name, mimeType, size, trashed',
    });
    if (res.data.trashed) throw new Error('File is trashed');
    return {
      id: res.data.id!,
      name: res.data.name ?? 'file',
      mimeType: res.data.mimeType ?? 'application/octet-stream',
      size: Number(res.data.size ?? 0),
    };
  } catch (err) {
    throw mapDriveError(err);
  }
}

export async function renameFile(driveFileId: string, name: string): Promise<void> {
  try {
    await drive.files.update({ fileId: driveFileId, requestBody: { name } });
  } catch (err) {
    throw mapDriveError(err);
  }
}

/** Permanently removes a file from Drive (used on delete / account cleanup). */
export async function deleteFile(driveFileId: string): Promise<void> {
  try {
    await drive.files.delete({ fileId: driveFileId });
  } catch (err) {
    const mapped = mapDriveError(err);
    // A file already gone is not an error for our purposes.
    if (mapped.status === 404) return;
    throw mapped;
  }
}

/**
 * Reports the central account's storage usage. Google returns `storageQuota`
 * only for the authenticated account — the app's own usage is tracked in
 * Supabase, this is the hard ceiling.
 */
export async function getStorageQuota(): Promise<{ limit: number | null; usage: number | null }> {
  try {
    const res = await drive.about.get({ fields: 'storageQuota' });
    return {
      limit: res.data.storageQuota?.limit ? Number(res.data.storageQuota.limit) : null,
      usage: res.data.storageQuota?.usage ? Number(res.data.storageQuota.usage) : null,
    };
  } catch (err) {
    throw mapDriveError(err);
  }
}

/**
 * Builds the consent URL the OWNER visits once to mint the refresh token. This
 * is an offline setup step, not something the app performs at runtime.
 */
export function buildOwnerConsentUrl(): string {
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    // Least privilege: only files this app creates/opens.
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });
}
