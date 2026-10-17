import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { logger } from '../../lib/logger.js';
import type { NotificationKind } from '@studyspace/shared';

interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  /** A stable key so a retried operation cannot create a second notification. */
  dedupeKey?: string;
}

/**
 * Creates an in-app notification, honouring the recipient's per-kind preference
 * and de-duplicating on `dedupeKey`. Email/push are intentionally not sent here
 * — the in-app channel is the reliable one; others are optional add-ons.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const { data: prefs } = await supabaseAdmin
    .from('notification_preferences')
    .select('overrides')
    .eq('user_id', input.userId)
    .maybeSingle();

  const overrides = (prefs?.overrides ?? {}) as Record<string, boolean>;
  if (overrides[input.kind] === false) return;

  const { error } = await supabaseAdmin.from('notifications').insert({
    user_id: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    dedupe_key: input.dedupeKey ?? null,
  });

  // A duplicate dedupe_key is expected on retries, not an error.
  if (error && !/duplicate key/i.test(error.message)) {
    logger.warn({ err: error, userId: input.userId }, 'Failed to create notification');
  }
}

/** Notifies many recipients at once, skipping the actor themselves. */
export async function notifyMany(
  userIds: string[],
  input: Omit<NotifyInput, 'userId'> & { actorId?: string },
): Promise<void> {
  const targets = [...new Set(userIds)].filter((id) => id !== input.actorId);
  await Promise.all(targets.map((userId) => notify({ ...input, userId })));
}
