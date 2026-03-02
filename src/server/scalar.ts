import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** Options for the Scalar API documentation UI. */
export interface ScalarOptions {
  /** Title shown in the browser tab. */
  title?: string;
  /** Color scheme for the docs UI. */
  colorScheme?: 'light' | 'dark' | 'auto';
  /** Custom CSS to inject into the docs page. */
  customCss?: string;
  /** Route path for the docs UI. */
  routePath?: string;
  /** Route path for the raw JSON spec. */
  jsonPath?: string;
}

/** Default Scalar custom CSS with light/dark mode variables. */
const defaultCss = `
.light-mode {
  color-scheme: light;
  --scalar-color-1: #1c1e21;
  --scalar-color-2: #757575;
  --scalar-color-3: #8e8e8e;
  --scalar-color-accent: #2f8555;
  --scalar-background-1: #fff;
  --scalar-background-2: #f5f5f5;
  --scalar-background-3: #ededed;
  --scalar-border-color: rgba(0, 0, 0, 0.1);
  --scalar-button-1: rgb(49 53 56);
  --scalar-button-1-color: #fff;
  --scalar-button-1-hover: rgb(28 31 33);
}
.dark-mode {
  color-scheme: dark;
  --scalar-color-1: rgba(255, 255, 255, 0.9);
  --scalar-color-2: rgba(255, 255, 255, 0.62);
  --scalar-color-3: rgba(255, 255, 255, 0.44);
  --scalar-color-accent: #27c2a0;
  --scalar-background-1: #1b1b1d;
  --scalar-background-2: #242526;
  --scalar-background-3: #3b3b3b;
  --scalar-border-color: rgba(255, 255, 255, 0.1);
  --scalar-button-1: #f6f6f6;
  --scalar-button-1-color: #000;
  --scalar-button-1-hover: #e7e7e7;
}
`;

/** Generates the HTML document for Scalar API reference. */
function buildHtmlDocument(
  title: string,
  colorScheme: string,
  customCss: string,
  schemaJson: string,
) {
  return `<!DOCTYPE html>
<html>
  <head>
    <title>${title}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style type="text/css">
    .darklight-reference-promo,.darklight-reference-promo[href] { display: none !important; }
    .darklight,button.darklight { padding: 18px 24px !important; ${colorScheme !== 'auto' ? 'display: none !important;' : ''} }
    ${customCss}
    </style>
  </head>
  <body>
    <script id="api-reference" type="application/json">${schemaJson}</script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}

/** Registers Scalar API documentation routes on a Fastify instance. */
export function registerScalar(
  server: FastifyInstance,
  options: ScalarOptions = {},
) {
  const {
    title = 'API Reference',
    colorScheme = 'auto',
    customCss = defaultCss,
    routePath = '/docs',
    jsonPath = '/docs/json',
  } = options;

  server.get(routePath, async (_: FastifyRequest, reply: FastifyReply) => {
    // biome-ignore lint/suspicious/noExplicitAny: swagger() may not be typed
    const schema = (server as any).swagger?.();
    const schemaJson = JSON.stringify(schema ?? {});
    return reply
      .header('Content-Type', 'text/html; charset=utf-8')
      .send(buildHtmlDocument(title, colorScheme, customCss, schemaJson));
  });

  server.get(jsonPath, async () => {
    // biome-ignore lint/suspicious/noExplicitAny: swagger() may not be typed
    return (server as any).swagger?.() ?? {};
  });
}
