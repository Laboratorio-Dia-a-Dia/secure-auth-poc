import { createClient, type RedisClientType } from 'redis';
import { env } from '@config/env';
import { logger } from '@shared/utils/Logger';

class RedisClient {
  private client: RedisClientType | null = null;

  private isConnecting = false;

  async getClient(): Promise<RedisClientType> {
    if (this.client?.isOpen) {
      return this.client;
    }

    if (this.isConnecting) {
      // Aguarda conexão existente
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      return this.getClient();
    }

    this.isConnecting = true;

    try {
      this.client = createClient({
        url: env.REDIS_URL,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('❌ Redis: Maximum reconnection attempts reached');
              return new Error('Redis connection failed');
            }
            const delay = Math.min(retries * 100, 3000);
            logger.warn(`⚠️  Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
            return delay;
          },
        },
      });

      this.client.on('error', (err) => {
        logger.error('🔥 Redis Client Error:', err);
      });

      this.client.on('connect', () => {
        logger.info('✅ Redis: Connected');
      });

      this.client.on('ready', () => {
        logger.info('✅ Redis: Ready');
      });

      this.client.on('reconnecting', () => {
        logger.warn('⚠️  Redis: Reconnecting...');
      });

      await this.client.connect();
      this.isConnecting = false;

      return this.client;
    } catch (error) {
      this.isConnecting = false;
      logger.error('❌ Redis: Connection failed', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client?.isOpen) {
      await this.client.quit();
      logger.info('✅ Redis: Disconnected');
    }
  }
}

export const redisClient = new RedisClient();
