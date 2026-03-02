export type { AuthAdapter, SessionType } from './adapter.js';
export type {
  AuthGuardConfig,
  ConfiguredWithAuthOptions,
  WithAuthOptions,
} from './guard.js';
export { createWithAuth, withAuth } from './guard.js';
export type { AuthPluginOptions } from './plugin.js';
export { buildAuthPlugin, transformToHeaders } from './plugin.js';
