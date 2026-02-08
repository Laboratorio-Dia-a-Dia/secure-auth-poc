/* eslint-disable @typescript-eslint/no-explicit-any */

// CRITICAL: set NODE_ENV BEFORE importing app/env
import request from 'supertest';
import { prisma } from '@modules/user/user.repository';
import { redisClient } from '@shared/infra/redis';
import { hashProvider } from '@shared/utils/HashProvider';
import { app } from '../../app';

process.env['NODE_ENV'] = 'test';

function extractCookie(cookies: string[] | string | undefined, name: string): string {
  if (!cookies) return '';

  const arr = Array.isArray(cookies) ? cookies : [cookies];

  return arr.find((c) => c.startsWith(`${name}=`)) || '';
}

describe('Auth Integration Tests', () => {
  const testUser = {
    email: 'test@example.com',
    password: 'TestPassword123!',
    name: 'Test User',
  };

  beforeAll(async () => {
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
    try {
      await prisma.user.deleteMany({
        where: { email: testUser.email },
      });
    } catch {
      // ignore
    }

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

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();

      const accessCookie = extractCookie(cookies, 'access_token');
      const refreshCookie = extractCookie(cookies, 'refresh_token');

      expect(accessCookie).toBeTruthy();
      expect(refreshCookie).toBeTruthy();
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
    it('should refresh tokens successfully', async () => {
      const loginResponse = await request(app).post('/api/auth/login').send({
        email: testUser.email,
        password: testUser.password,
        rememberMe: false,
      });

      const cookies = loginResponse.headers['set-cookie'];

      const refreshTokenCookie = extractCookie(cookies, 'refresh_token');
      expect(refreshTokenCookie).toBeTruthy();

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.headers['set-cookie']).toBeDefined();
    });
  });

  describe('POST /api/auth/logout', () => {
    let accessTokenCookie = '';
    beforeAll(async () => {
      // Clear Redis to reset rate limits from previous tests
      const client = await redisClient.getClient();
      await client.flushAll();

      const loginResponse = await request(app).post('/api/auth/login').send({
        email: testUser.email,
        password: testUser.password,
        rememberMe: false,
      });

      const cookies = loginResponse.headers['set-cookie'];
      accessTokenCookie = extractCookie(cookies, 'access_token');

      expect(accessTokenCookie).toBeTruthy();
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

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
    });
  });

  describe('PATCH /api/users/password', () => {
    beforeAll(async () => {
      // Clear Redis
      const client = await redisClient.getClient();
      await client.flushAll();

      // Recreate User to ensure clean state
      await prisma.user.deleteMany({ where: { email: testUser.email } });
      const passwordHash = await hashProvider.hash(testUser.password);
      await prisma.user.create({
        data: {
          ...testUser,
          password: passwordHash,
        },
      });
    });

    it('should update password and revoke all tokens', async () => {
      const loginResponse = await request(app).post('/api/auth/login').send({
        email: testUser.email,
        password: testUser.password,
        rememberMe: false,
      });

      const cookies = loginResponse.headers['set-cookie'];

      const accessTokenCookie = extractCookie(cookies, 'access_token');
      const refreshTokenCookie = extractCookie(cookies, 'refresh_token');

      expect(accessTokenCookie).toBeTruthy();
      expect(refreshTokenCookie).toBeTruthy();

      const newPassword = 'NewPassword456!';

      // CRITICAL: Wait before updating password to ensure revocation timestamp > token IAT
      // This prevents "same second" issues where iat == revocation (which is considered valid)
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1500);
      });

      const updateResponse = await request(app)
        .patch('/api/users/password')
        .set('Cookie', accessTokenCookie)
        .send({
          currentPassword: testUser.password,
          newPassword,
        })
        .expect(200);

      expect(updateResponse.body.status).toBe('success');

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });

      await request(app).get('/api/users/me').set('Cookie', accessTokenCookie).expect(401);

      await request(app).post('/api/auth/refresh').set('Cookie', refreshTokenCookie).expect(401);

      // Wait for rate limiter to reset
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1100);
      });

      const newLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: newPassword,
          rememberMe: false,
        })
        .expect(200);

      expect(newLoginResponse.body.status).toBe('success');

      const newCookies = newLoginResponse.headers['set-cookie'];
      const newAccessCookie = extractCookie(newCookies, 'access_token');

      expect(newAccessCookie).toBeTruthy();

      await request(app)
        .patch('/api/users/password')
        .set('Cookie', newAccessCookie)
        .send({
          currentPassword: newPassword,
          newPassword: testUser.password,
        })
        .expect(200);

      // Wait after reset to ensure consistency
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1100);
      });
    }, 20000);

    it(
      'should reject wrong current password',
      async () => {
        const freshLogin = await request(app).post('/api/auth/login').send({
          email: testUser.email,
          password: testUser.password,
          rememberMe: false,
        });

        const cookies = freshLogin.headers['set-cookie'];
        const accessTokenCookie = extractCookie(cookies, 'access_token');

        if (!accessTokenCookie) {
          // Debug info if needed
        }

        expect(accessTokenCookie).toBeTruthy();

        await request(app)
          .patch('/api/users/password')
          .set('Cookie', accessTokenCookie)
          .send({
            currentPassword: 'WrongPassword',
            newPassword: 'NewPassword789!',
          })
          .expect(401);
      }, 20000);
  });

  describe('Token Reuse Detection', () => {
    beforeAll(async () => {
      const client = await redisClient.getClient();
      await client.flushAll();

      await prisma.user.deleteMany({ where: { email: testUser.email } });
      const passwordHash = await hashProvider.hash(testUser.password);
      await prisma.user.create({
        data: {
          ...testUser,
          password: passwordHash,
        },
      });
    });

    it('should detect refresh token reuse and revoke all tokens', async () => {
      const loginResponse = await request(app).post('/api/auth/login').send({
        email: testUser.email,
        password: testUser.password,
        rememberMe: false,
      });

      const cookies = loginResponse.headers['set-cookie'];
      const oldRefreshToken = extractCookie(cookies, 'refresh_token');

      expect(oldRefreshToken).toBeTruthy();

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      });

      const firstRefreshResponse = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', oldRefreshToken)
        .expect(200);

      expect(firstRefreshResponse.body.status).toBe('success');

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 11000);
      });

      const reuseResponse = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', oldRefreshToken)
        .expect(401);

      expect(reuseResponse.body.message).toContain('reuse');
    }, 25000);
  });

  describe('Protected Routes', () => {
    beforeAll(async () => {
      const client = await redisClient.getClient();
      await client.flushAll();

      await prisma.user.deleteMany({ where: { email: testUser.email } });
      const passwordHash = await hashProvider.hash(testUser.password);
      await prisma.user.create({
        data: {
          ...testUser,
          password: passwordHash,
        },
      });
    });

    it('should deny access without token', async () => {
      await request(app).get('/api/users/me').expect(401);
    });

    it('should allow access with valid token', async () => {
      const loginResponse = await request(app).post('/api/auth/login').send({
        email: testUser.email,
        password: testUser.password,
        rememberMe: false,
      });

      const cookies = loginResponse.headers['set-cookie'];
      const accessTokenCookie = extractCookie(cookies, 'access_token');

      expect(accessTokenCookie).toBeTruthy();

      const response = await request(app)
        .get('/api/users/me')
        .set('Cookie', accessTokenCookie)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.data.user.userId).toBeDefined();
      expect(response.body.data.user.email).toBe(testUser.email);
    });
  });
});
