import { env } from '@config/env';
import { redisClient } from '@shared/infra/redis';
import { prisma } from '@modules/user/user.repository';
import { logger } from '@shared/utils/Logger';
import { app } from './app';

const startServer = async () => {
  try {
    // Conecta ao Redis
    await redisClient.getClient();
    logger.info('✅ Redis connected successfully');

    // Testa conexão com o banco
    await prisma.$connect();
    logger.info('✅ Database connected successfully');

    // Inicia o servidor
    const server = app.listen(env.PORT, () => {
      logger.info('🚀 Server is running');
      logger.info(`📍 URL: ${env.API_URL}`);
      logger.info(`🌍 Environment: ${env.NODE_ENV}`);
      logger.info(`🔒 CORS Origin: ${env.CORS_ORIGIN}`);
    });

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
      logger.info(`\n⚠️  ${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        logger.info('✅ HTTP server closed');

        await prisma.$disconnect();
        logger.info('✅ Database disconnected');

        await redisClient.disconnect();
        logger.info('✅ Redis disconnected');

        process.exit(0);
      });

      // Força shutdown após 10 segundos
      setTimeout(() => {
        logger.error('❌ Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
