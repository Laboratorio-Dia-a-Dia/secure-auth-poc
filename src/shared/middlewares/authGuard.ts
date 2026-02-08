import type { Request as ExpressRequest, Response, NextFunction } from 'express';
import { tokenManager } from '@shared/utils/TokenManager';
import { tokenBlacklist } from '@shared/utils/TokenBlacklist';
import { UnauthorizedError } from '@shared/errors/AppError';

// Estende o Request do Express para incluir o usuário autenticado
declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      userId: string;
      email: string;
    };
  }
}

export const authGuard = async (req: ExpressRequest, _res: Response, next: NextFunction) => {
  try {
    // 1. Extrai o token do cookie (HttpOnly)
    // eslint-disable-next-line dot-notation
    const accessToken = req.cookies['access_token'];

    if (!accessToken) {
      throw new UnauthorizedError('Access token not found');
    }

    // 2. Verifica a validade criptográfica do token
    const payload = tokenManager.verifyAccessToken(accessToken);

    // 3. Check no Redis: token foi revogado?
    const isBlacklisted = await tokenBlacklist.isBlacklisted(accessToken);

    if (isBlacklisted) {
      throw new UnauthorizedError('Token has been revoked');
    }

    // 4. Check no Redis: todos os tokens do usuário foram revogados?
    const revocationTimestamp = await tokenBlacklist.getUserRevocationTimestamp(payload.userId);

    if (revocationTimestamp) {
      if (!payload.iat) {
        // Se o token não tem iat, assume que é antigo/inseguro se houver revogação
        throw new UnauthorizedError('Token revocation check failed: missing iat');
      }

      // Se o token foi emitido ANTES da revogação, bloqueia
      if (payload.iat < revocationTimestamp) {
        throw new UnauthorizedError('Token has been revoked by user security event');
      }
    }

    // 5. Injeta o usuário no Request
    req.user = {
      userId: payload.userId,
      email: payload.email,
    };

    next();
  } catch (error) {
    next(error);
  }
};
