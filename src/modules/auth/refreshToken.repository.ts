import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export class RefreshTokenRepository {
  /**
   * Cria um novo refresh token no banco
   */
  async create(userId: string, token: string, expiresAt: Date) {
    const tokenHash = this.hashToken(token);

    return prisma.refreshToken.create({
      data: {
        token: tokenHash,
        userId,
        expiresAt,
      },
    });
  }

  /**
   * Busca um refresh token por hash
   */
  async findByToken(token: string) {
    const tokenHash = this.hashToken(token);

    return prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });
  }

  /**
   * Marca um token como revogado
   */
  async revoke(tokenId: string, replacedBy?: string) {
    return prisma.refreshToken.update({
      where: { id: tokenId },
      data: {
        revokedAt: new Date(),
        replacedBy: replacedBy ?? null,
      },
    });
  }

  /**
   * Implementa Grace Period - salva o novo token gerado durante rotação
   */
  async setGracePeriod(tokenId: string, newToken: string, gracePeriodSeconds: number) {
    const gracePeriodEnds = new Date(Date.now() + gracePeriodSeconds * 1000);

    return prisma.refreshToken.update({
      where: { id: tokenId },
      data: {
        gracePeriodToken: this.hashToken(newToken),
        gracePeriodEnds,
      },
    });
  }

  /**
   * Revoga todos os tokens de um usuário
   */
  async revokeAllByUserId(userId: string) {
    return prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Remove tokens expirados (limpeza periódica)
   */
  async deleteExpired() {
    return prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
