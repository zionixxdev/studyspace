import { createApp } from './app.js';
import { env, driveConfigured } from './config/env.js';
import { logger } from './lib/logger.js';
import { getRootFolderId } from './services/google-drive/client.js';

/**
 * Server entry point. When Drive is configured we verify the root folder is
 * reachable at boot, so a misconfiguration surfaces immediately rather than on
 * the first upload. When it is not configured we start anyway — the app is
 * usable without files, and the config endpoint tells the UI to say so.
 */
async function main() {
  const app = createApp();

  if (driveConfigured) {
    try {
      const rootId = await getRootFolderId();
      logger.info({ rootFolderId: rootId }, 'Google Drive reachable');
    } catch (err) {
      logger.warn(
        { err },
        'Google Drive is not reachable at startup — file features will fail until it is fixed',
      );
    }
  } else {
    logger.warn('Google Drive is not configured — file upload and sharing are disabled');
  }

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'StudySpace API listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void main();
