/**
 * Thin re-export of the shared row types plus the Supabase Database interface
 * used to type the client. Kept hand-written so the app compiles with no live
 * project; regenerate with `supabase gen types typescript` when convenient.
 */
export type {
  Annotation,
  AppNotification,
  Conversation,
  ConversationMember,
  DriveFile,
  FileShare,
  Group,
  GroupMember,
  Message,
  Profile,
  StudyRoom,
  StudyRoomMember,
  StudySession,
  Task,
  UserSettings,
} from '@studyspace/shared';

export type Theme = 'light' | 'dark' | 'system';
