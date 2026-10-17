import type {
  AnnotationType,
  FileScope,
  FocusMode,
  GroupRole,
  NotificationKind,
  RoomRole,
  TaskPriority,
  UploadState,
} from './constants.js';

/**
 * Hand-written row types mirroring supabase/migrations/*.sql. A generated
 * `database.types.ts` can replace these later (`supabase gen types typescript`),
 * but keeping them explicit means the app compiles without a live project.
 */

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  notify_email: boolean;
  notify_push: boolean;
  profile_visibility: 'public' | 'friends' | 'private';
  reduced_motion: boolean;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  created_by: string;
  created_at: string;
  last_message_at: string | null;
}

export interface ConversationMember {
  conversation_id: string;
  user_id: string;
  role: 'member' | 'admin';
  muted: boolean;
  last_read_at: string | null;
  joined_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reply_to_id: string | null;
  attachment_file_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface DriveFile {
  id: string;
  owner_id: string;
  drive_file_id: string | null;
  name: string;
  mime: string;
  size_bytes: number;
  scope: FileScope;
  scope_id: string | null;
  upload_state: UploadState;
  created_at: string;
  archived_at: string | null;
}

export interface FileShare {
  id: string;
  file_id: string;
  scope: FileScope;
  scope_id: string;
  permission: 'view' | 'download' | 'edit';
  expires_at: string | null;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  visibility: 'public' | 'private';
  owner_id: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: GroupRole;
  joined_at: string;
}

export interface StudyRoom {
  id: string;
  name: string;
  subject: string | null;
  host_id: string;
  file_id: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface StudyRoomMember {
  room_id: string;
  user_id: string;
  role: RoomRole;
  joined_at: string;
}

export interface Annotation {
  id: string;
  file_id: string;
  room_id: string | null;
  author_id: string;
  page: number;
  type: AnnotationType;
  geometry: Record<string, unknown>;
  color: string;
  text: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  owner_id: string;
  group_id: string | null;
  room_id: string | null;
  title: string;
  notes: string | null;
  subject: string | null;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface StudySession {
  id: string;
  user_id: string;
  task_id: string | null;
  mode: FocusMode;
  duration_sec: number;
  started_at: string;
  ended_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

/** Standard envelope for every API response. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    /** Field-level validation issues, when applicable. */
    fields?: Record<string, string[]>;
    requestId?: string;
  };
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export type ApiResult<T> = T | ApiError;

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'error' in value;
}
