import { EmailTemplate } from '@daveyplate/better-auth-ui/server';
import { render } from '@react-email/components';
import type { EmailTemplateVars } from './emails.js';

/** Renders email verification using React Email + better-auth-ui template. */
export async function renderEmailVerificationReact(
  vars: EmailTemplateVars,
): Promise<string> {
  const element = EmailTemplate({
    action: 'Verify Email',
    content: (
      <>
        <p>{`Hello ${vars.name ?? 'there'},`}</p>
        <p>Welcome to {vars.appName}!</p>
        <p>
          Please verify your email address by clicking the button below.
        </p>
      </>
    ),
    heading: 'Verify Email',
    siteName: vars.appName,
    baseUrl: vars.baseUrl ?? '',
    url: vars.url,
  });
  return render(element);
}

/** Renders magic link sign-in using React Email + better-auth-ui template. */
export async function renderMagicLinkReact(
  vars: EmailTemplateVars,
): Promise<string> {
  const element = EmailTemplate({
    action: 'Sign In',
    content: (
      <>
        <p>Hello,</p>
        <p>
          Click the button below to sign in to your {vars.appName} account.
        </p>
        <p>
          This link will expire in 10 minutes for security reasons. If you
          didn't request this, you can safely ignore this email.
        </p>
      </>
    ),
    heading: `Sign in to ${vars.appName}`,
    siteName: vars.appName,
    baseUrl: vars.baseUrl ?? '',
    url: vars.url,
  });
  return render(element);
}
