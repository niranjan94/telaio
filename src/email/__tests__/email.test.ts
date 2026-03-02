import { describe, expect, it } from 'vitest';
import type { EmailConfig, EmailSendOptions } from '../index.js';

describe('email module', () => {
  it('exports sendReactEmail function', async () => {
    const mod = await import('../index.js');
    expect(mod.sendReactEmail).toBeDefined();
    expect(typeof mod.sendReactEmail).toBe('function');
  });

  it('EmailSendOptions type has expected shape', () => {
    // Type-level test: this compiles if the interface is correct
    const options: EmailSendOptions = {
      from: 'noreply@example.com',
      to: 'user@example.com',
      subject: 'Test Email',
      react: null, // React element placeholder
    };
    expect(options.from).toBe('noreply@example.com');
    expect(options.to).toBe('user@example.com');
    expect(options.subject).toBe('Test Email');
  });

  it('EmailConfig type has expected shape', () => {
    const config: EmailConfig = {
      region: 'us-east-1',
    };
    expect(config.region).toBe('us-east-1');
  });
});
