import { z } from 'zod';

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(3000),
  API_URL: z.string().url(),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),
  REDIS_TTL_DEFAULT: z.coerce.number().default(900),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  REFRESH_GRACE_PERIOD_SECONDS: z.coerce.number().min(5).max(30).default(10),

  // Argon2
  ARGON2_TIME_COST: z.coerce.number().min(2).max(10).default(3),
  ARGON2_MEMORY_COST: z.coerce.number().min(1024).max(131072).default(65536),
  ARGON2_PARALLELISM: z.coerce.number().min(1).max(8).default(4),

  // Rate Limiting
  RATE_LIMIT_LOGIN_IP_MAX: z.coerce.number().default(5),
  RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS: z.coerce.number().default(60),
  RATE_LIMIT_LOGIN_EMAIL_MAX: z.coerce.number().default(3),
  RATE_LIMIT_LOGIN_EMAIL_WINDOW_SECONDS: z.coerce.number().default(60),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().default(100),
  RATE_LIMIT_GLOBAL_WINDOW_SECONDS: z.coerce.number().default(60),

  // CORS
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Cookies
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('strict'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.format());
    throw new Error('Environment validation failed');
  }

  return result.data;
};

export const env = parseEnv();
