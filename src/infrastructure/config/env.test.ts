import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  INTERNAL_API_KEY: 'key',
  TOUTBOX_BASE_URL: 'https://toutbox.example.com',
  TOUTBOX_API_KEY: 'toutbox-key',
  TOUTBOX_WEBHOOK_API_KEY: 'webhook-key',
  WAVE_DELIVERY_API_BASE_URL: 'https://wave-delivery-api.example.com',
  WAVE_DELIVERY_API_KEY: 'wave-delivery-key',
} as NodeJS.ProcessEnv;

describe('loadEnv', () => {
  it('fails when INTERNAL_API_KEY is missing', () => {
    expect(() =>
      loadEnv({
        TOUTBOX_BASE_URL: base.TOUTBOX_BASE_URL,
        TOUTBOX_API_KEY: base.TOUTBOX_API_KEY,
        TOUTBOX_WEBHOOK_API_KEY: base.TOUTBOX_WEBHOOK_API_KEY,
        WAVE_DELIVERY_API_BASE_URL: base.WAVE_DELIVERY_API_BASE_URL,
        WAVE_DELIVERY_API_KEY: base.WAVE_DELIVERY_API_KEY,
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('fails when TOUTBOX_BASE_URL or TOUTBOX_API_KEY is missing', () => {
    expect(() =>
      loadEnv({
        INTERNAL_API_KEY: 'key',
        TOUTBOX_WEBHOOK_API_KEY: base.TOUTBOX_WEBHOOK_API_KEY,
        WAVE_DELIVERY_API_BASE_URL: base.WAVE_DELIVERY_API_BASE_URL,
        WAVE_DELIVERY_API_KEY: base.WAVE_DELIVERY_API_KEY,
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('fails when TOUTBOX_WEBHOOK_API_KEY is missing', () => {
    expect(() =>
      loadEnv({
        INTERNAL_API_KEY: base.INTERNAL_API_KEY,
        TOUTBOX_BASE_URL: base.TOUTBOX_BASE_URL,
        TOUTBOX_API_KEY: base.TOUTBOX_API_KEY,
        WAVE_DELIVERY_API_BASE_URL: base.WAVE_DELIVERY_API_BASE_URL,
        WAVE_DELIVERY_API_KEY: base.WAVE_DELIVERY_API_KEY,
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('fails when WAVE_DELIVERY_API_BASE_URL or WAVE_DELIVERY_API_KEY is missing', () => {
    expect(() =>
      loadEnv({
        INTERNAL_API_KEY: base.INTERNAL_API_KEY,
        TOUTBOX_BASE_URL: base.TOUTBOX_BASE_URL,
        TOUTBOX_API_KEY: base.TOUTBOX_API_KEY,
        TOUTBOX_WEBHOOK_API_KEY: base.TOUTBOX_WEBHOOK_API_KEY,
      } as NodeJS.ProcessEnv),
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
