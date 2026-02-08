import jwt from 'jsonwebtoken';
import { env } from '@config/env';
import { UnauthorizedError } from '@shared/errors/AppError';

export interface AccessTokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

export class TokenManager {
  generateAccessToken(payload: AccessTokenPayload): string {
    // Type assertion para evitar conflito entre Zod string e JWT StringValue
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      issuer: 'secure-auth-poc',
      audience: 'api',
      jwtid: crypto.randomUUID(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  generateRefreshToken(payload: RefreshTokenPayload): string {
    // Type assertion para evitar conflito entre Zod string e JWT StringValue
    return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      issuer: 'secure-auth-poc',
      audience: 'refresh',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        issuer: 'secure-auth-poc',
        audience: 'api',
      }) as AccessTokenPayload;

      return decoded;
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
        issuer: 'secure-auth-poc',
        audience: 'refresh',
      }) as RefreshTokenPayload;

      return decoded;
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }

  getTokenExpiration(token: string): number | null {
    try {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      return decoded?.exp ?? null;
    } catch {
      return null;
    }
  }

  getTokenId(token: string): string | null {
    try {
      const decoded = jwt.decode(token) as { jti?: string } | null;
      return decoded?.jti ?? null;
    } catch {
      return null;
    }
  }
}

export const tokenManager = new TokenManager();
