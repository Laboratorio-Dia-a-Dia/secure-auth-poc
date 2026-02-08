import { userRepository } from '@modules/user/user.repository';
import { hashProvider } from '@shared/utils/HashProvider';
import { tokenManager } from '@shared/utils/TokenManager';
import { tokenBlacklist } from '@shared/utils/TokenBlacklist';
import { ConflictError, UnauthorizedError, BadRequestError } from '@shared/errors/AppError';
import { env } from '@config/env';
import { logger } from '@shared/utils/Logger';
import { refreshTokenRepository } from './refreshToken.repository';
import type { RegisterDTO, LoginDTO, UpdatePasswordDTO } from './auth.schema';

export class AuthService {
  /**
   * Registro de novo usuário
   */
  async register(data: RegisterDTO) {
    // Verifica se o usuário já existe
    const existingUser = await userRepository.findByEmail(data.email);

    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    // Hash da senha
    const passwordHash = await hashProvider.hash(data.password);

    // Cria o usuário
    const user = await userRepository.create({
      email: data.email,
      password: passwordHash,
      name: data.name,
    });

    logger.info('User registered', { userId: user.id, email: user.email });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    };
  }

  /**
   * Login do usuário
   */
  async login(data: LoginDTO) {
    // Busca o usuário
    const user = await userRepository.findByEmail(data.email);

    if (!user) {
      logger.warn('Login failed: User not found', { email: data.email });
      throw new UnauthorizedError('Invalid credentials');
    }

    // Verifica a senha
    const passwordMatches = await hashProvider.compare(data.password, user.password);

    if (!passwordMatches) {
      logger.warn('Login failed: Invalid password', { userId: user.id, email: user.email });
      throw new UnauthorizedError('Invalid credentials');
    }

    // Gera Access Token
    const accessToken = tokenManager.generateAccessToken({
      userId: user.id,
      email: user.email,
    });

    // Calcula expiração do Refresh Token
    const refreshExpiresIn = data.rememberMe ? '30d' : env.JWT_REFRESH_EXPIRES_IN;
    const expiresAt = this.calculateExpiration(refreshExpiresIn);

    // Gera JWT do Refresh Token PRIMEIRO (para poder guardar no DB)
    const refreshToken = tokenManager.generateRefreshToken({
      userId: user.id,
      tokenId: crypto.randomUUID(), // Token único para o JWT
    });

    // Cria Refresh Token no banco com hash do JWT
    await refreshTokenRepository.create(
      user.id,
      refreshToken, // Agora passamos o JWT para ser hasheado
      expiresAt
    );

    logger.info('Login successful', { userId: user.id, email: user.email });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      accessToken,
      refreshToken,
      rememberMe: data.rememberMe,
    };
  }

  /**
   * Refresh de tokens com Automatic Rotation + Grace Period
   */
  async refresh(refreshToken: string) {
    // Verifica o JWT
    const payload = tokenManager.verifyRefreshToken(refreshToken);

    // Busca o token no banco
    const tokenRecord = await refreshTokenRepository.findByToken(refreshToken);

    if (!tokenRecord) {
      logger.warn('Refresh token not found', { tokenId: payload.tokenId });
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Verifica se o token foi revogado
    if (tokenRecord.revokedAt) {
      // REUSE DETECTION: Token foi usado após revogação
      logger.warn('Token reuse detected', { userId: payload.userId, tokenId: payload.tokenId });
      // Revoga toda a família de tokens (segurança)
      await refreshTokenRepository.revokeAllByUserId(payload.userId);
      await tokenBlacklist.revokeAllUserTokens(payload.userId, 5);

      throw new UnauthorizedError('Token reuse detected. All sessions revoked.');
    }

    // Verifica expiração
    if (tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expired');
    }

    // GRACE PERIOD CHECK: Se já gerou um novo token há pouco tempo, retorna o mesmo
    if (tokenRecord.gracePeriodToken && tokenRecord.gracePeriodEnds) {
      if (tokenRecord.gracePeriodEnds > new Date()) {
        // Ainda no grace period, retorna o token armazenado
        const gracePeriodAccessToken = tokenManager.generateAccessToken({
          userId: tokenRecord.user.id,
          email: tokenRecord.user.email,
        });

        return {
          accessToken: gracePeriodAccessToken,
          refreshToken: tokenRecord.gracePeriodToken,
        };
      }
    }

    // AUTOMATIC ROTATION: Cria novos tokens
    const newAccessToken = tokenManager.generateAccessToken({
      userId: tokenRecord.user.id,
      email: tokenRecord.user.email,
    });

    // Gera o novo Refresh Token JWT PRIMEIRO
    const newRefreshToken = tokenManager.generateRefreshToken({
      userId: tokenRecord.user.id,
      tokenId: crypto.randomUUID(),
    });

    // Cria registro no banco com hash do JWT e captura o ID
    const newTokenRecord = await refreshTokenRepository.create(
      tokenRecord.user.id,
      newRefreshToken, // Passa o JWT para ser hasheado
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dias
    );

    // Ativa Grace Period no token antigo (pode falhar se já foi deletado)
    try {
      await refreshTokenRepository.setGracePeriod(
        tokenRecord.id,
        newRefreshToken,
        env.REFRESH_GRACE_PERIOD_SECONDS
      );

      // Revoga o token antigo (após grace period)
      setTimeout(async () => {
        try {
          await refreshTokenRepository.revoke(tokenRecord.id, newTokenRecord.id);
        } catch {
          // Token já foi revogado ou deletado - ignora
        }
      }, env.REFRESH_GRACE_PERIOD_SECONDS * 1000);
    } catch {
      // Token já foi revogado/deletado - ignora e prossegue
    }

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logout
   */
  async logout(accessToken: string, refreshToken?: string) {
    // Adiciona o Access Token na blacklist
    await tokenBlacklist.add(accessToken);

    // Revoga o Refresh Token se fornecido
    if (refreshToken) {
      try {
        const payload = tokenManager.verifyRefreshToken(refreshToken);
        await refreshTokenRepository.revoke(payload.tokenId);
      } catch {
        // Token inválido, ignora
      }
    }

    logger.info('Logout', { accessToken: `${accessToken.substring(0, 10)}...` });
  }

  /**
   * Atualizar senha
   */
  async updatePassword(userId: string, data: UpdatePasswordDTO) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new BadRequestError('User not found');
    }

    // Verifica senha atual
    const passwordMatches = await hashProvider.compare(data.currentPassword, user.password);

    if (!passwordMatches) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash da nova senha
    const newPasswordHash = await hashProvider.hash(data.newPassword);

    // Atualiza a senha
    await userRepository.updatePassword(userId, newPasswordHash);

    // REVOGA TODOS OS TOKENS (força re-login em todos os dispositivos)
    await refreshTokenRepository.revokeAllByUserId(userId);
    // Invalida tokens emitidos ANTES de agora (timestamp check no authGuard)
    await tokenBlacklist.revokeAllUserTokens(userId, 3600);

    logger.info('Password updated', { userId });
  }

  private calculateExpiration(duration: string): Date {
    const match = duration.match(/^(\d+)([dhm])$/);

    if (!match) {
      throw new Error('Invalid duration format');
    }

    const value = parseInt(match[1] ?? '0', 10);
    const unit = match[2];

    const now = Date.now();

    switch (unit) {
      case 'd':
        return new Date(now + value * 24 * 60 * 60 * 1000);
      case 'h':
        return new Date(now + value * 60 * 60 * 1000);
      case 'm':
        return new Date(now + value * 60 * 1000);
      default:
        throw new Error('Invalid duration unit');
    }
  }
}

export const authService = new AuthService();
