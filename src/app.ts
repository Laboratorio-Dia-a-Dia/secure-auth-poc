import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import hpp from 'hpp';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { env } from '@config/env';
import { swaggerSpec } from '@config/swagger';
import { errorHandler } from '@shared/middlewares/errorHandler';
import { rateLimiter } from '@shared/middlewares/rateLimiter';
import { csrfProtection } from '@shared/middlewares/csrfProtection';
import { authRoutes } from '@modules/auth/auth.routes';
import { userRoutes } from '@modules/user/user.routes';

const app = express();

// =====================================================
// SECURITY MIDDLEWARES
// =====================================================

// Helmet - Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// CORS
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

// HPP - Prevent HTTP Parameter Pollution
app.use(hpp());

// =====================================================
// PARSERS
// =====================================================

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// =====================================================
// RATE LIMITING & CSRF
// =====================================================

app.use(rateLimiter.globalLimit());

// CSRF only in non-test environments
if (env.NODE_ENV !== 'test') {
  app.use(csrfProtection.sendToken());
  app.use(csrfProtection.validateToken.bind(csrfProtection));
}

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
  });
});

// =====================================================
// API DOCUMENTATION
// =====================================================

app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Secure Auth Gateway API Docs',
  })
);

// =====================================================
// ROUTES
// =====================================================

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// =====================================================
// 404 HANDLER
// =====================================================

app.use((_req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found',
  });
});

// =====================================================
// ERROR HANDLER (Must be last)
// =====================================================

app.use(errorHandler);

export { app };
