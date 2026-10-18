import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { allowedOrigins, isProd, env, isPlaceholder } from './config/env.js';
import { logger } from './lib/logger.js';
import { apiRouter } from './routes/index.js';
import { healthRouter } from './routes/health.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * The built SPA, when this process also serves the frontend. A placeholder
 * value (hosting dashboards offer the literal "value") is ignored so static
 * serving is not silently broken.
 */
function webDir(): string {
  const configured = env.SERVE_WEB_DIR;
  if (configured && !isPlaceholder(configured)) return configured;
  return resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)));
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
    cors((req, cb) => {
      const origin = req.headers.origin;
      const host = req.headers.host;
      // When one container serves both the API and the SPA, the browser sends
      // the app's own origin on state-changing requests. That is same-origin
      // and must be allowed — otherwise every POST from the deployed app is
      // rejected. We also never throw here: a disallowed origin simply gets no
      // CORS headers (and the browser blocks it) rather than a 500.
      let sameOrigin = false;
      if (origin && host) {
        try {
          sameOrigin = new URL(origin).host === host;
        } catch {
          sameOrigin = false;
        }
      }
      const allowed = !origin || sameOrigin || allowedOrigins.includes(origin);
      cb(null, {
        origin: allowed ? (origin ?? true) : false,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type'],
      });
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
