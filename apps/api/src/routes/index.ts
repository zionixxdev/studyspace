import { Router } from 'express';
import { generalLimiter } from '../middleware/rateLimit.js';
import { healthRouter } from './health.js';
import { meRouter } from './me.js';
import { filesRouter } from './files.js';
import { conversationsRouter } from './conversations.js';
import { socialRouter } from './social.js';
import { groupsRouter } from './groups.js';
import { roomsRouter, annotationsRouter } from './study-rooms.js';
import { tasksRouter } from './productivity.js';
import { notificationsRouter } from './notifications.js';
import { searchRouter } from './search.js';

/** Everything is mounted under /api/v1 so the surface can evolve safely. */
export const apiRouter = Router();

apiRouter.use(generalLimiter);

// Health is also mounted at the root (see app.ts) so uptime checks are cheap.
apiRouter.use(healthRouter);
apiRouter.use(meRouter);
apiRouter.use(filesRouter);
apiRouter.use(conversationsRouter);
apiRouter.use(socialRouter);
apiRouter.use(groupsRouter);
apiRouter.use(roomsRouter);
apiRouter.use(annotationsRouter);
apiRouter.use(tasksRouter);
apiRouter.use(notificationsRouter);
apiRouter.use(searchRouter);
