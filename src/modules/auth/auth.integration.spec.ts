/* eslint-disable @typescript-eslint/no-explicit-any */
// CRITICAL: Set NODE_ENV before ANY imports to ensure app.ts reads correct value
process.env['NODE_ENV'] = 'test';

import request from 'supertest';
import { prisma } from '@modules/user/user.repository';
import { redisClient } from '@shared/infra/redis';
import { app } from '../../app';

describe('Auth Integration Tests', () => {
  const testUser = {
    email: 'test@example.com',
    password: 'TestPassword123',
    name: 'Test User',
  };

  beforeAll(async () => {
    // Conecta ao Redis e DB antes dos testes
    try {
      await redisClient.getClient();
      await prisma.$connect();
    } catch (error) {
      console.error('\n⚠️  Falha ao conectar com infraestrutura:');
      console.error('   Redis e MySQL são necessários para testes de integração.');
      console.error('   Execute: npm run docker:up\n');
      throw error;
    }
  });

  afterAll(async () => {
    // Cleanup: Remove usuário de teste
    try {
      await prisma.user.deleteMany({
        where: { email: testUser.email },
      });
    } catch {
      // Ignora se não existir
    }

    // Desconecta
    await prisma.$disconnect();
    await redisClient.disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app).post('/api/auth/register').send(testUser).expect(201);

      expect(response.body.status).toBe('success');
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('should reject duplicate email', async () => {
      // API returns 409 Conflict for duplicate emails (more specific than 400)
      await request(app).post('/api/auth/register').send(testUser).expect(409);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully and set cookies', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
          rememberMe: false,
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.headers['set-cookie']).toBeDefined();

      const cookies = response.headers['set-cookie'];
      if (Array.isArray(cookies)) {
        expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
        expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
      }
    });

    it('should reject invalid credentials', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword',
          rememberMe: false,
        })
        .expect(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshTokenCookie: string;

    beforeAll(async () => {
      // Faz login para obter refresh token
      const loginResponse = await request(app).post('/api/auth/login').send({
        email: testUser.email,
        password: testUser.password,
        rememberMe: false,
      });

      const cookies = loginResponse.headers['set-cookie'];
      if (Array.isArray(cookies)) {
        refreshTokenCookie = cookies.find((c) => c.startsWith('refresh_token=')) || '';
      }
    });

    it('should refresh tokens successfully', async () => {
      // Wait 1s to ensure token is valid and not immediately expired
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.headers['set-cookie']).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    let accessTokenCookie: string;

    beforeAll(async () => {
      const loginResponse = await request(app).post('/api/auth/login').send({
        email: testUser.email,
        password: testUser.password,
        rememberMe: false,
      });

      const cookies = loginResponse.headers['set-cookie'];
      if (Array.isArray(cookies)) {
        accessTokenCookie = cookies.find((c) => c.startsWith('access_token=')) || '';
      }
    });

    it('should logout successfully and clear cookies', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', accessTokenCookie)
        .expect(200);

      expect(response.body.status).toBe('success');

      const cookies = response.headers['set-cookie'];
      if (Array.isArray(cookies)) {
        expect(cookies.some((c) => c.includes('access_token=;'))).toBe(true);
      }
    });
  });
});
