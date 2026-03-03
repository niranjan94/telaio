import { createApp } from 'telaio';
import { authAdapter } from './auth/adapter.js';
import config from './config.js';
import logger from './logger.js';

/** Builds and configures the Fastify application. */
export async function buildApp(ephemeral = false) {
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

  return builder.build();
}
