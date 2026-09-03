import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  INTERNAL_API_KEY: 'key',
  TOUTBOX_BASE_URL: 'https://toutbox.example.com',
  TOUTBOX_API_KEY: 'toutbox-key',
} as NodeJS.ProcessEnv;

describe('loadEnv', () => {
  it('fails when INTERNAL_API_KEY is missing', () => {
    expect(() =>
      loadEnv({
        TOUTBOX_BASE_URL: base.TOUTBOX_BASE_URL,
        TOUTBOX_API_KEY: base.TOUTBOX_API_KEY,
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('fails when TOUTBOX_BASE_URL or TOUTBOX_API_KEY is missing', () => {
    expect(() =>
      loadEnv({ INTERNAL_API_KEY: 'key' } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('applies the documented defaults', () => {
    const env = loadEnv(base);

    expect(env.NODE_ENV).toBe('development');
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.PORT).toBe(8080);
    expect(env.NEW_RELIC_APP_NAME).toBe('toutbox-carrier-service');
    expect(env.NEW_RELIC_ENABLED).toBe(false);
  });
});
