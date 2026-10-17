import pino from 'pino';
import { isProd } from '../config/env.js';

export const logger = pino({
  level: isProd ? 'info' : 'debug',
  // Redact anything that could carry a credential or private content.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.access_token',
      '*.refresh_token',
      '*.password',
      'GOOGLE_REFRESH_TOKEN',
      'SUPABASE_SERVICE_ROLE_KEY',
    ],
    censor: '[redacted]',
  },
});
