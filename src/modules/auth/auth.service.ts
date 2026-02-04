import { userRepository } from '@modules/user/user.repository';
import { hashProvider } from '@shared/utils/HashProvider';
import { tokenManager } from '@shared/utils/TokenManager';
import { tokenBlacklist } from '@shared/utils/TokenBlacklist';
import { ConflictError, UnauthorizedError, BadRequestError } from '@shared/errors/AppError';
import { env } from '@config/env';
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
      throw new UnauthorizedError('Invalid credentials');
    }

    // Verifica a senha
    const passwordMatches = await hashProvider.compare(data.password, user.password);

    if (!passwordMatches) {
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

    // Cria Refresh Token no banco
    const refreshTokenRecord = await refreshTokenRepository.create(
      user.id,
      crypto.randomUUID(), // Token único
      expiresAt
    );

    // Gera JWT do Refresh Token
    const refreshToken = tokenManager.generateRefreshToken({
      userId: user.id,
      tokenId: refreshTokenRecord.id,
    });

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
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Verifica se o token foi revogado
    if (tokenRecord.revokedAt) {
      // REUSE DETECTION: Token foi usado após revogação
      // Revoga toda a família de tokens (segurança)
      await refreshTokenRepository.revokeAllByUserId(payload.userId);
      await tokenBlacklist.revokeAllUserTokens(payload.userId, 3600);

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

    const newRefreshTokenRecord = await refreshTokenRepository.create(
      tokenRecord.user.id,
      crypto.randomUUID(),
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dias
    );

    const newRefreshToken = tokenManager.generateRefreshToken({
      userId: tokenRecord.user.id,
      tokenId: newRefreshTokenRecord.id,
    });

    // Ativa Grace Period no token antigo
    await refreshTokenRepository.setGracePeriod(
      tokenRecord.id,
      newRefreshToken,
      env.REFRESH_GRACE_PERIOD_SECONDS
    );

    // Revoga o token antigo (após grace period)
    setTimeout(async () => {
      await refreshTokenRepository.revoke(tokenRecord.id, newRefreshTokenRecord.id);
    }, env.REFRESH_GRACE_PERIOD_SECONDS * 1000);

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
    await tokenBlacklist.revokeAllUserTokens(userId, 3600);
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
