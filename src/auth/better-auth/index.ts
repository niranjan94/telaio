// Adapter
export {
  type CreateBetterAuthAdapterOptions,
  createBetterAuthAdapter,
} from './adapter.js';

// Client helpers
export {
  type OrgSessionHookOptions,
  orgSchemaMap,
  orgSessionHooks,
  redisSecondaryStorage,
  snakeCaseSchema,
  socialProviders,
} from './client.js';

// Config
export { type BetterAuthEnvConfig, betterAuthConfigSchema } from './config.js';

// Email templates
export {
  type EmailCallbackOptions,
  type EmailSender,
  type EmailTemplateVars,
  type SESEmailSenderOptions,
  createSESEmailSender,
  emailVerificationCallbacks,
  magicLinkCallbacks,
  renderBaseLayout,
  renderEmailVerification,
  renderMagicLink,
} from './emails.js';

// React Email renderers (opt-in, requires @daveyplate/better-auth-ui + @react-email/components)
export {
  renderEmailVerificationReact,
  renderMagicLinkReact,
} from './emails-react.js';
// Types
export type {
  BetterAuthOrgSession,
  BetterAuthSession,
  OrganizationRole,
  Session,
  User,
} from './types.js';
