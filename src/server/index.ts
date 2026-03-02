import './fastify-augments.js';

export { registerHooks } from './hooks.js';
export {
  type AutoloadOptions,
  type CompressOptions,
  type CookieOptions,
  type CorsOptions,
  type HelmetOptions,
  type MultipartOptions,
  type PluginOptions,
  registerAutoload,
  registerPlugins,
  type WebsocketOptions,
} from './plugins.js';
export { registerScalar, type ScalarOptions } from './scalar.js';
export { registerSwagger, type SwaggerOptions } from './swagger.js';
