import { createApp } from 'telaio';
import { authAdapter } from './auth/adapter.js';
import config from './config.js';
import logger from './logger.js';

/** Shared app builder -- used by both server.ts and consumer.ts. */
export function getBuilder(ephemeral = false) {
  const builder = createApp({ config, logger })
    .withPlugins({
      cors: {
        credentials: true,
        origins: config.CORS_ORIGINS.concat([config.FRONTEND_URL]),
      },
      helmet: true,
    })
    .withSwagger({
      info: { title: config.APP_NAME, version: '1.0.0' },
    })
    .withDatabase()
    .withAuth(authAdapter)
    .withApiDocs();

  if (ephemeral) {
    builder.asEphemeral();
  }

  return builder;
}
