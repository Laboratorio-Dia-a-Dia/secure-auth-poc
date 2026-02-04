import type { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { redisClient } from '@shared/infra/redis';
import { env } from '@config/env';
import { TooManyRequestsError } from '@shared/errors/AppError';

class RateLimiter {
  private loginIpLimiter: RateLimiterRedis | null = null;

  private loginEmailLimiter: RateLimiterRedis | null = null;

  private globalLimiter: RateLimiterRedis | null = null;

  async initialize() {
    const client = await redisClient.getClient();

    this.loginIpLimiter = new RateLimiterRedis({
      storeClient: client,
      keyPrefix: 'rl:login:ip',
      points: env.RATE_LIMIT_LOGIN_IP_MAX,
      duration: env.RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS,
      blockDuration: env.RATE_LIMIT_LOGIN_IP_WINDOW_SECONDS * 2,
    });

    this.loginEmailLimiter = new RateLimiterRedis({
      storeClient: client,
      keyPrefix: 'rl:login:email',
      points: env.RATE_LIMIT_LOGIN_EMAIL_MAX,
      duration: env.RATE_LIMIT_LOGIN_EMAIL_WINDOW_SECONDS,
      blockDuration: env.RATE_LIMIT_LOGIN_EMAIL_WINDOW_SECONDS * 3,
    });

    this.globalLimiter = new RateLimiterRedis({
      storeClient: client,
      keyPrefix: 'rl:global',
      points: env.RATE_LIMIT_GLOBAL_MAX,
      duration: env.RATE_LIMIT_GLOBAL_WINDOW_SECONDS,
    });
  }

  // Middleware de rate limiting global (por IP)
  globalLimit() {
    return async (req: Request, _res: Response, next: NextFunction) => {
      // Skip rate limiting in test environment
      if (env.NODE_ENV === 'test') {
        return next();
      }

      if (!this.globalLimiter) {
        await this.initialize();
      }

      const ip = this.getClientIp(req);

      try {
        await this.globalLimiter!.consume(ip);
        next();
      } catch (error) {
        if (error instanceof RateLimiterRes) {
          const retryAfter = Math.ceil(error.msBeforeNext / 1000);
          throw new TooManyRequestsError(`Too many requests. Retry after ${retryAfter} seconds`);
        }
        next(error);
      }
    };
  }

  // Middleware de rate limiting para login (híbrido: IP + Email)
  loginLimit() {
    return async (req: Request, _res: Response, next: NextFunction) => {
      // Skip rate limiting in test environment
      if (env.NODE_ENV === 'test') {
        return next();
      }

      if (!this.loginIpLimiter || !this.loginEmailLimiter) {
        await this.initialize();
      }

      const ip = this.getClientIp(req);
      const email = req.body.email as string | undefined;

      try {
        // Rate limit por IP
        await this.loginIpLimiter!.consume(ip);

        // Rate limit por Email (se fornecido)
        if (email) {
          await this.loginEmailLimiter!.consume(email.toLowerCase());
        }

        next();
      } catch (error) {
        if (error instanceof RateLimiterRes) {
          const retryAfter = Math.ceil(error.msBeforeNext / 1000);
          throw new TooManyRequestsError(
            `Too many login attempts. Retry after ${retryAfter} seconds`
          );
        }
        next(error);
      }
    };
  }

  private getClientIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }
}

export const rateLimiter = new RateLimiter();
