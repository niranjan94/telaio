/** Options for rendering an email template. */
export interface EmailTemplateVars {
  appName: string;
  url: string;
  name?: string;
}

/** Function that sends an email. Users provide their own implementation (SES, Resend, etc.). */
export type EmailSender = (options: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) => Promise<void>;

/** Options for creating email callback factories. */
export interface EmailCallbackOptions {
  appName: string;
  send: EmailSender;
  /** Override the default HTML template. Receives vars, returns HTML string. */
  template?: (vars: EmailTemplateVars) => string;
  /** Override the default subject line. */
  subject?: string | ((vars: EmailTemplateVars) => string);
}

/**
 * Shared HTML email layout. Table-based, max-width 600px, system font stack.
 * Works in all major email clients including Outlook.
 */
export function renderBaseLayout(content: string, appName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <tr>
            <td style="padding:40px 48px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 48px;background-color:#fafafa;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:13px;color:#71717a;text-align:center;">${appName}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Renders a CTA button for email templates. */
function renderButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px 0;">
  <tr>
    <td style="background-color:#18181b;border-radius:6px;">
      <a href="${url}" target="_blank" style="display:inline-block;padding:12px 32px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
        ${text}
      </a>
    </td>
  </tr>
</table>`;
}

/** Renders the email verification HTML template. */
export function renderEmailVerification(vars: EmailTemplateVars): string {
  const greeting = vars.name ? `Hello ${vars.name},` : 'Hello,';
  const content = `
    <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;">${greeting}</p>
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Welcome to ${vars.appName}!</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;line-height:1.6;">
      Please verify your email address to get started. Click the button below to confirm your account.
    </p>
    ${renderButton('Verify Email', vars.url)}
    <p style="margin:0;font-size:13px;color:#a1a1aa;">
      If you didn't create an account, you can safely ignore this email.
    </p>`;
  return renderBaseLayout(content, vars.appName);
}

/** Renders the magic link sign-in HTML template. */
export function renderMagicLink(vars: EmailTemplateVars): string {
  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Sign in to ${vars.appName}</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;line-height:1.6;">
      Click the button below to sign in to your account. No password needed.
    </p>
    ${renderButton('Sign In', vars.url)}
    <p style="margin:0 0 4px;font-size:13px;color:#a1a1aa;">
      This link expires in 10 minutes.
    </p>
    <p style="margin:0;font-size:13px;color:#a1a1aa;">
      If you didn't request this, you can safely ignore this email.
    </p>`;
  return renderBaseLayout(content, vars.appName);
}

/** Returns better-auth emailVerification config with default template. */
export function emailVerificationCallbacks(options: EmailCallbackOptions) {
  return {
    sendVerificationEmail: async ({
      user,
      url,
    }: {
      user: { name?: string; email: string };
      url: string;
    }) => {
      const vars: EmailTemplateVars = {
        appName: options.appName,
        url,
        name: user.name || user.email.split('@')[0],
      };
      const template = options.template ?? renderEmailVerification;
      const subject =
        typeof options.subject === 'function'
          ? options.subject(vars)
          : (options.subject ??
            `Verify your email address - ${options.appName}`);
      await options.send({
        to: user.email,
        subject,
        html: template(vars),
        text: `Verify your email for ${options.appName}: ${url}`,
      });
    },
    autoSignInAfterVerification: true,
    sendOnSignUp: true,
  };
}

/** Returns magic link plugin's sendMagicLink option with default template. */
export function magicLinkCallbacks(options: EmailCallbackOptions) {
  return {
    disableSignUp: true,
    sendMagicLink: async ({ email, url }: { email: string; url: string }) => {
      const vars: EmailTemplateVars = { appName: options.appName, url };
      const template = options.template ?? renderMagicLink;
      const subject =
        typeof options.subject === 'function'
          ? options.subject(vars)
          : (options.subject ?? `Sign in to ${options.appName}`);
      await options.send({
        to: email,
        subject,
        html: template(vars),
        text: `Sign in to ${options.appName}: ${url}`,
      });
    },
  };
}
