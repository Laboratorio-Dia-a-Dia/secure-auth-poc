/* eslint-disable @typescript-eslint/no-explicit-any */
import jwt from 'jsonwebtoken';
import { tokenManager } from './TokenManager';

// Mock das variáveis de ambiente
jest.mock('@config/env', () => ({
  env: {
    JWT_ACCESS_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  },
}));

describe('TokenManager Unit Tests', () => {
  const payload = {
    userId: 'user-123',
    email: 'test@example.com',
  };

  it('should generate a valid access token', () => {
    const token = tokenManager.generateAccessToken(payload);
    expect(token).toBeDefined();

    const decoded = jwt.verify(token, 'access-secret') as any;
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.iss).toBe('secure-auth-poc');
    expect(decoded.aud).toBe('api');
  });

  it('should generate a valid refresh token', () => {
    const refreshPayload = {
      userId: 'user-123',
      tokenId: 'token-uuid',
    };

    const token = tokenManager.generateRefreshToken(refreshPayload);
    expect(token).toBeDefined();

    const decoded = jwt.verify(token, 'refresh-secret') as any;
    expect(decoded.userId).toBe(refreshPayload.userId);
    expect(decoded.tokenId).toBe(refreshPayload.tokenId);
    expect(decoded.iss).toBe('secure-auth-poc');
    expect(decoded.aud).toBe('refresh');
  });

  it('should verify a valid access token correctly', () => {
    const token = jwt.sign(payload, 'access-secret', {
      subject: payload.userId,
      issuer: 'secure-auth-poc',
      audience: 'api',
    });

    const result = tokenManager.verifyAccessToken(token);
    expect(result.userId).toBe(payload.userId);
  });

  it('should throw error for invalid access token', () => {
    const token = jwt.sign(payload, 'wrong-secret');

    expect(() => {
      tokenManager.verifyAccessToken(token);
    }).toThrow('Invalid or expired access token');
  });

  it('should extract token expiration', () => {
    const token = tokenManager.generateAccessToken(payload);
    const exp = tokenManager.getTokenExpiration(token);

    expect(exp).toBeDefined();
    expect(typeof exp).toBe('number');
  });
});
