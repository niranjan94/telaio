/** Options for sending a React-rendered email via SES. */
export interface EmailSendOptions {
  /** Sender email address. */
  from: string;
  /** Recipient email address. */
  to: string;
  /** Email subject line. */
  subject: string;
  /** React element to render as the email body. */
  // biome-ignore lint/suspicious/noExplicitAny: ReactNode from optional peer dep
  react: any;
}

/** Configuration for the email sender. */
export interface EmailConfig {
  /** AWS SES region. */
  region: string;
}

/**
 * Sends a React Email template via AWS SES.
 * Renders the React component to both HTML and plain text.
 *
 * Requires `@aws-sdk/client-ses` and `@react-email/components` as peer dependencies.
 */
export async function sendReactEmail(
  options: EmailSendOptions,
  config: EmailConfig,
): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: peer dep types from dynamic import
  let sesMod: any;
  // biome-ignore lint/suspicious/noExplicitAny: peer dep types from dynamic import
  let render: any;

  try {
    sesMod = await import('@aws-sdk/client-ses');
  } catch {
    throw new Error(
      "telaio: sendReactEmail() requires '@aws-sdk/client-ses' to be installed. Run: pnpm add @aws-sdk/client-ses",
    );
  }

  try {
    const emailMod = await import('@react-email/components');
    render = emailMod.render;
  } catch {
    throw new Error(
      "telaio: sendReactEmail() requires '@react-email/components' to be installed. Run: pnpm add @react-email/components",
    );
  }

  const ses = new sesMod.SES({ region: config.region });

  const [html, text] = await Promise.all([
    render(options.react),
    render(options.react, { plainText: true }),
  ]);

  await ses.sendEmail({
    Source: options.from,
    Destination: {
      ToAddresses: [options.to],
    },
    Message: {
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: html,
        },
        Text: {
          Charset: 'UTF-8',
          Data: text,
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: options.subject,
      },
    },
  });
}
