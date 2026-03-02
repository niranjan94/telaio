/** Configuration for creating an S3 client. */
export interface S3ClientConfig {
  /** AWS region (e.g., 'us-east-1'). */
  region: string;
  /** Custom S3-compatible endpoint (e.g., for MinIO). */
  endpoint?: string;
  /** Explicit access key ID. If omitted, SDK falls back to default credential chain. */
  accessKeyId?: string;
  /** Explicit secret access key. If omitted, SDK falls back to default credential chain. */
  secretAccessKey?: string;
}

/**
 * Creates an S3Client instance with optional explicit credentials.
 * When credentials are omitted, the SDK falls back to its default
 * credential chain (env vars, IAM role, etc.).
 *
 * Requires `@aws-sdk/client-s3` as a peer dependency.
 */
export async function createS3Client(
  clientConfig: S3ClientConfig,
  // biome-ignore lint/suspicious/noExplicitAny: S3Client type from optional peer dep
): Promise<any> {
  let S3ClientClass: new (opts: Record<string, unknown>) => unknown;
  try {
    const mod = await import('@aws-sdk/client-s3');
    S3ClientClass = mod.S3Client;
  } catch {
    throw new Error(
      "telaio: createS3Client() requires '@aws-sdk/client-s3' to be installed. Run: pnpm add @aws-sdk/client-s3",
    );
  }

  return new S3ClientClass({
    region: clientConfig.region,
    endpoint: clientConfig.endpoint,
    credentials:
      clientConfig.accessKeyId && clientConfig.secretAccessKey
        ? {
            accessKeyId: clientConfig.accessKeyId,
            secretAccessKey: clientConfig.secretAccessKey,
          }
        : undefined,
  });
}
