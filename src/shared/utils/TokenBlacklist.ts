import { createHash } from 'crypto';
import { redisClient } from '@shared/infra/redis';
import { tokenManager } from './TokenManager';

export class TokenBlacklist {
  private readonly prefix = 'blacklist';

  /**
   * Adiciona um token à blacklist com TTL dinâmico
   * @param token - Token JWT a ser revogado
   */
  async add(token: string): Promise<void> {
    const client = await redisClient.getClient();

    // Calcula TTL dinâmico baseado na expiração do token
    const expirationTimestamp = tokenManager.getTokenExpiration(token);

    if (!expirationTimestamp) {
      throw new Error('Invalid token: no expiration found');
    }

    const now = Math.floor(Date.now() / 1000);
    const ttl = Math.max(expirationTimestamp - now, 0);

    if (ttl === 0) {
      // Token já expirou, não precisa blacklist
      return;
    }

    const key = this.getKey(token);
    await client.setEx(key, ttl, 'revoked');
  }

  /**
   * Verifica se o token está na blacklist
   * @param token - Token JWT a ser verificado
   * @returns true se o token está revogado
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const client = await redisClient.getClient();
    const key = this.getKey(token);
    const result = await client.get(key);
    return result === 'revoked';
  }

  /**
   * Remove um token da blacklist (raramente necessário)
   * @param token - Token JWT a ser removido
   */
  async remove(token: string): Promise<void> {
    const client = await redisClient.getClient();
    const key = this.getKey(token);
    await client.del(key);
  }

  /**
   * Revoga todos os tokens de um usuário específico
   * @param userId - ID do usuário
   * @param ttl - Tempo de vida em segundos
   */
  async revokeAllUserTokens(userId: string, ttl: number = 3600): Promise<void> {
    const client = await redisClient.getClient();
    const key = `${this.prefix}:user:${userId}`;
    await client.setEx(key, ttl, 'all_revoked');
  }

  /**
   * Verifica se todos os tokens de um usuário foram revogados
   * @param userId - ID do usuário
   */
  async areAllUserTokensRevoked(userId: string): Promise<boolean> {
    const client = await redisClient.getClient();
    const key = `${this.prefix}:user:${userId}`;
    const result = await client.get(key);
    return result === 'all_revoked';
  }

  private getKey(token: string): string {
    // Usa hash do token para economizar memória
    const hash = createHash('sha256').update(token).digest('hex');
    return `${this.prefix}:token:${hash}`;
  }
}

export const tokenBlacklist = new TokenBlacklist();
