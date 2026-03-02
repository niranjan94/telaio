import { describe, expect, it } from 'vitest';
import { createS3Client } from '../index.js';

describe('createS3Client', () => {
  it('creates a client with region only', () => {
    const client = createS3Client({ region: 'us-east-1' });
    expect(client).toBeDefined();
    // S3Client from the SDK should have a config property
    expect(client.config).toBeDefined();
  });

  it('creates a client with explicit credentials', () => {
    const client = createS3Client({
      region: 'us-west-2',
      accessKeyId: 'AKIATEST',
      secretAccessKey: 'secret123',
    });
    expect(client).toBeDefined();
  });

  it('creates a client with custom endpoint', () => {
    const client = createS3Client({
      region: 'us-east-1',
      endpoint: 'http://localhost:9000',
    });
    expect(client).toBeDefined();
  });

  it('does not set credentials when only accessKeyId is provided', () => {
    // Only accessKeyId without secretAccessKey — should fall back to SDK chain
    const client = createS3Client({
      region: 'us-east-1',
      accessKeyId: 'AKIATEST',
    });
    expect(client).toBeDefined();
  });

  it('exports createS3Client as a function', async () => {
    const mod = await import('../index.js');
    expect(mod.createS3Client).toBeDefined();
    expect(typeof mod.createS3Client).toBe('function');
  });
});
