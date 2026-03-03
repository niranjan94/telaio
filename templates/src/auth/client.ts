import { betterAuth } from 'better-auth';
import config from '../config.js';
import { pool } from '../db/client.js';

export const auth = betterAuth({
  database: pool,
  basePath: '/auth',
  appName: config.APP_NAME,
  secret: config.BETTER_AUTH_SECRET,
  trustedOrigins: [config.FRONTEND_URL],
  emailAndPassword: { enabled: true },
});
