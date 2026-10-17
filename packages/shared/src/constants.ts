/**
 * Shared constants and enums used by both the web app and the API.
 * Keeping them here guarantees the two sides cannot drift apart.
 */

export const APP_NAME = 'StudySpace';

/** Roles within a community (group). Ordered by privilege, lowest first. */
export const GROUP_ROLES = ['member', 'moderator', 'admin', 'owner'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

/** Roles within a study room. */
export const ROOM_ROLES = ['member', 'host'] as const;
export type RoomRole = (typeof ROOM_ROLES)[number];

/** Task priorities. */
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Lifecycle of an upload as it moves through the Drive pipeline. */
export const UPLOAD_STATES = ['pending', 'uploading', 'completed', 'failed', 'deleting'] as const;
export type UploadState = (typeof UPLOAD_STATES)[number];

/** Annotation primitive types supported by both workspaces. */
export const ANNOTATION_TYPES = [
  'highlight',
  'underline',
  'rect',
  'ellipse',
  'freehand',
  'note',
] as const;
export type AnnotationType = (typeof ANNOTATION_TYPES)[number];

export const FOCUS_MODES = ['focus', 'short_break', 'long_break'] as const;
export type FocusMode = (typeof FOCUS_MODES)[number];

/** Notification categories. */
export const NOTIFICATION_KINDS = [
  'message',
  'reply',
  'mention',
  'friend_request',
  'group_invite',
  'room_invite',
  'task_reminder',
  'moderation',
  'system',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** File visibility scopes. */
export const FILE_SCOPES = ['private', 'user', 'conversation', 'group', 'room'] as const;
export type FileScope = (typeof FILE_SCOPES)[number];

/** Upload limits (bytes). Kept in one place so the client and server agree. */
export const LIMITS = {
  MAX_FILE_BYTES: 25 * 1024 * 1024, // 25 MB per file
  MAX_IMAGE_BYTES: 10 * 1024 * 1024, // 10 MB per image
  MAX_MESSAGE_LENGTH: 4000,
  MAX_BIO_LENGTH: 280,
  MAX_USERNAME_LENGTH: 32,
  MESSAGE_PAGE_SIZE: 40,
  SEARCH_PAGE_SIZE: 20,
  /** Per-user rolling upload budget for the free tier. */
  PER_USER_STORAGE_BYTES: 250 * 1024 * 1024, // 250 MB
} as const;

export const ALLOWED_DOCUMENT_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/** Username rules: 3–32 chars, letters/digits/underscore, must start with a letter. */
export const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/;
