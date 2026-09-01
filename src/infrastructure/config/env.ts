import { z } from 'zod';

/**
 * Single source of truth for required environment variables. Add new variables
 * here — the app refuses to boot if the environment does not satisfy this
 * schema (fail fast over failing weird).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(8080),
  INTERNAL_API_KEY: z.string().min(1, 'INTERNAL_API_KEY is required'),
  NEW_RELIC_APP_NAME: z.string().default('toutbox-carrier-service'),
  NEW_RELIC_LICENSE_KEY: z.string().optional(),
  NEW_RELIC_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Parses the validated environment. The result is cached when read from the
 * default `process.env`; an explicit source is always parsed fresh (useful in
 * tests).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (source !== process.env) {
    return envSchema.parse(source);
  }
  if (!cached) {
    cached = envSchema.parse(source);
  }
  return cached;
}
