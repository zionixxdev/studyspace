import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { allowedOrigins, isProd } from './config/env.js';
import { logger } from './lib/logger.js';
import { apiRouter } from './routes/index.js';
import { healthRouter } from './routes/health.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/** The built SPA, when this process also serves the frontend. */
function webDir(): string {
  return process.env.SERVE_WEB_DIR ?? resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)));
}

export function createApp() {
  const app = express();

  // Behind a proxy (hosting platform), trust the first hop for correct IPs.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // The SPA is served from the same origin; allow its own scripts/styles.
      contentSecurityPolicy: isProd ? undefined : false,
    }),
  );
  app.use(
    cors({
      origin(origin, cb) {
        // Allow same-origin/no-origin (server-to-server, curl) and the allow-list.
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  );

  // Request logging with a correlation id; secrets are redacted by the logger.
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  app.use(express.json({ limit: '1mb' }));

  // Health at the root for platforms that probe a fixed path.
  app.use(healthRouter);

  app.use('/api/v1', apiRouter);

  // ---- Static frontend (single-container deployment) ----------------------
  // When a build of the SPA is present, serve it and fall back to index.html
  // for client-side routes. API paths are excluded so a bad API URL 404s
  // instead of silently returning the app shell.
  const dir = webDir();
  if (existsSync(join(dir, 'index.html'))) {
    const indexHtml = readFileSync(join(dir, 'index.html'), 'utf8');
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.type('html').send(indexHtml);
    });
    logger.info({ dir }, 'Serving the built frontend');
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export { isProd };
