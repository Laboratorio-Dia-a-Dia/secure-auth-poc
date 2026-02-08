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
   * @param ttl - Tempo de vida em segundos (default: 1 hora)
   */
  async revokeAllUserTokens(userId: string, ttl: number = 3600): Promise<void> {
    const client = await redisClient.getClient();
    const key = `${this.prefix}:user:${userId}`;
    // Armazena o timestamp atual para invalidar apenas tokens emitidos ANTES de agora
    const now = Math.floor(Date.now() / 1000);
    await client.setEx(key, ttl, now.toString());
  }

  /**
   * Obtém o timestamp de revogação global do usuário
   * @param userId - ID do usuário
   * @returns Timestamp (segundos) ou null se não houver revogação
   */
  async getUserRevocationTimestamp(userId: string): Promise<number | null> {
    const client = await redisClient.getClient();
    const key = `${this.prefix}:user:${userId}`;
    const result = await client.get(key);
    return result ? parseInt(result, 10) : null;
  }

  /**
   * Verifica se todos os tokens de um usuário foram revogados (Legacy support)
   * @deprecated Use getUserRevocationTimestamp com checagem de iat
   * @param userId - ID do usuário
   */
  async areAllUserTokensRevoked(userId: string): Promise<boolean> {
    const timestamp = await this.getUserRevocationTimestamp(userId);
    return !!timestamp;
  }

  private getKey(token: string): string {
    // Usa hash do token para economizar memória
    const hash = createHash('sha256').update(token).digest('hex');
    return `${this.prefix}:token:${hash}`;
  }
}

export const tokenBlacklist = new TokenBlacklist();
