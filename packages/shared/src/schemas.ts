import { z } from 'zod';
import {
  ALLOWED_DOCUMENT_MIME,
  GROUP_ROLES,
  LIMITS,
  NOTIFICATION_KINDS,
  ROOM_ROLES,
  TASK_PRIORITIES,
  USERNAME_REGEX,
} from './constants.js';

/**
 * Request/response validation schemas shared by the API (server-side
 * enforcement) and the web app (form validation). The API is the source of
 * truth: a value that fails here is rejected with 400 regardless of the client.
 */

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(LIMITS.MAX_USERNAME_LENGTH, 'Username is too long')
  .regex(USERNAME_REGEX, 'Use letters, numbers and underscores; start with a letter');

export const displayNameSchema = z.string().trim().min(1).max(80);

export const bioSchema = z.string().trim().max(LIMITS.MAX_BIO_LENGTH).optional();

export const updateProfileSchema = z.object({
  username: usernameSchema.optional(),
  displayName: displayNameSchema.optional(),
  bio: bioSchema,
  avatarUrl: z.string().url().nullish(),
});

export const updateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  notifyEmail: z.boolean().optional(),
  notifyPush: z.boolean().optional(),
  profileVisibility: z.enum(['public', 'friends', 'private']).optional(),
  reducedMotion: z.boolean().optional(),
});

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, 'Message cannot be empty')
  .max(LIMITS.MAX_MESSAGE_LENGTH, 'Message is too long');

export const createConversationSchema = z
  .object({
    type: z.enum(['direct', 'group']).default('direct'),
    title: z.string().trim().max(120).optional(),
    memberIds: z.array(z.string().uuid()).min(1, 'Pick at least one person').max(64),
  })
  .refine(
    (v) => v.type === 'group' || v.memberIds.length === 1,
    'Direct conversations take exactly one other member',
  );

export const sendMessageSchema = z.object({
  body: messageBodySchema,
  replyToId: z.string().uuid().nullish(),
  attachmentFileId: z.string().uuid().nullish(),
});

export const editMessageSchema = z.object({ body: messageBodySchema });

export const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
});

export const friendRequestSchema = z.object({
  targetId: z.string().uuid(),
  message: z.string().trim().max(280).optional(),
});

export const blockSchema = z.object({ userId: z.string().uuid() });

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  visibility: z.enum(['public', 'private']).default('public'),
  imageUrl: z.string().url().nullish(),
});

export const updateGroupSchema = createGroupSchema.partial();

export const inviteMemberSchema = z.object({
  userId: z.string().uuid().optional(),
  role: z.enum(GROUP_ROLES).default('member'),
});

export const changeRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(GROUP_ROLES),
});

export const initUploadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  mime: z.enum(ALLOWED_DOCUMENT_MIME),
  sizeBytes: z.number().int().positive().max(LIMITS.MAX_FILE_BYTES),
  /** Where the file should be visible once uploaded. */
  scope: z.enum(['private', 'user', 'conversation', 'group', 'room']).default('private'),
  /** The id of the conversation/group/room when scope is not private/user. */
  scopeId: z.string().uuid().nullish(),
  /** Client-supplied idempotency key so retries do not duplicate files. */
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const shareFileSchema = z.object({
  scope: z.enum(['user', 'conversation', 'group', 'room']),
  scopeId: z.string().uuid(),
  permission: z.enum(['view', 'download', 'edit']).default('view'),
  expiresAt: z.string().datetime().nullish(),
});

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(120).optional(),
  fileId: z.string().uuid().nullish(),
});

export const createAnnotationSchema = z.object({
  fileId: z.string().uuid(),
  roomId: z.string().uuid().nullish(),
  page: z.number().int().min(1),
  type: z.enum(['highlight', 'underline', 'rect', 'ellipse', 'freehand', 'note']),
  /** Normalised (0..1) coordinates so annotations survive zoom/resize. */
  geometry: z.record(z.unknown()),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb colour'),
  text: z.string().trim().max(4000).optional(),
});

export const updateAnnotationSchema = createAnnotationSchema.partial().omit({ fileId: true });

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).optional(),
  subject: z.string().trim().max(80).optional(),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  dueAt: z.string().datetime().nullish(),
  groupId: z.string().uuid().nullish(),
  roomId: z.string().uuid().nullish(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  completed: z.boolean().optional(),
});

export const createStudySessionSchema = z.object({
  mode: z.enum(['focus', 'short_break', 'long_break']),
  durationSec: z.number().int().min(1).max(4 * 60 * 60),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  taskId: z.string().uuid().nullish(),
});

export const reportSchema = z.object({
  targetType: z.enum(['user', 'message', 'group', 'file']),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(1).max(120),
  details: z.string().trim().max(2000).optional(),
});

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(LIMITS.MESSAGE_PAGE_SIZE),
});

export const searchSchema = z.object({
  q: z.string().trim().min(1).max(120),
  scope: z.enum(['all', 'users', 'groups', 'messages', 'files', 'rooms']).default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(LIMITS.SEARCH_PAGE_SIZE),
});

export const notificationKindSchema = z.enum(NOTIFICATION_KINDS);
export const roomRoleSchema = z.enum(ROOM_ROLES);

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type InitUploadInput = z.infer<typeof initUploadSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type CreateAnnotationInput = z.infer<typeof createAnnotationSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
