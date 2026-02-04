import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '@config/env';
import { ForbiddenError } from '@shared/errors/AppError';

class CsrfProtection {
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  validateToken(req: Request, _res: Response, next: NextFunction) {
    const tokenFromHeader = req.headers['x-csrf-token'] as string | undefined;
    const tokenFromCookie = req.cookies['csrf_token'] as string | undefined;

    // Permite GET, HEAD, OPTIONS sem validação CSRF
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    if (!tokenFromHeader || !tokenFromCookie) {
      throw new ForbiddenError('CSRF token missing');
    }

    // Constant-time comparison para evitar timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(tokenFromHeader),
      Buffer.from(tokenFromCookie)
    );

    if (!isValid) {
      throw new ForbiddenError('Invalid CSRF token');
    }

    next();
  }

  // Middleware para enviar o CSRF token ao cliente
  sendToken() {
    return (req: Request, res: Response, next: NextFunction) => {
      const existingToken = req.cookies['csrf_token'] as string | undefined;

      if (!existingToken) {
        const newToken = this.generateToken();

        res.cookie('csrf_token', newToken, {
          httpOnly: false, // Cliente precisa ler para enviar no header
          secure: env.COOKIE_SECURE,
          sameSite: env.COOKIE_SAME_SITE,
          maxAge: 24 * 60 * 60 * 1000, // 24h
          path: '/',
        });
      }

      next();
    };
  }
}

export const csrfProtection = new CsrfProtection();
