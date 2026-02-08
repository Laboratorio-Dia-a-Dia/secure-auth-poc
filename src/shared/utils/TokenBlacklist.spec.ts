import { createHash } from 'crypto';
import { redisClient } from '@shared/infra/redis';
import { TokenBlacklist } from './TokenBlacklist';
import { tokenManager } from './TokenManager';

// Mock do Redis client
jest.mock('@shared/infra/redis', () => ({
  redisClient: {
    getClient: jest.fn(),
  },
}));

// Mock do TokenManager
jest.mock('./TokenManager', () => ({
  tokenManager: {
    getTokenExpiration: jest.fn(),
  },
}));

describe('TokenBlacklist Unit Tests', () => {
  let tokenBlacklist: TokenBlacklist;
  let mockRedisClient: { setEx: jest.Mock; get: jest.Mock; del: jest.Mock };

  beforeEach(() => {
    tokenBlacklist = new TokenBlacklist();

    // Mock do Redis client
    mockRedisClient = {
      setEx: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    };

    (redisClient.getClient as jest.Mock).mockResolvedValue(mockRedisClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('add()', () => {
    it('should add token to blacklist with dynamic TTL', async () => {
      const token = 'valid.jwt.token';
      const futureTimestamp = Math.floor(Date.now() / 1000) + 900; // +15 min

      (tokenManager.getTokenExpiration as jest.Mock).mockReturnValue(futureTimestamp);

      await tokenBlacklist.add(token);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        expect.stringContaining('blacklist:token:'),
        expect.any(Number),
        'revoked'
      );

      const [, ttl] = mockRedisClient.setEx.mock.calls[0];
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(900);
    });

    it('should not add expired token to blacklist', async () => {
      const token = 'expired.jwt.token';
      const pastTimestamp = Math.floor(Date.now() / 1000) - 100; // já expirou

      (tokenManager.getTokenExpiration as jest.Mock).mockReturnValue(pastTimestamp);

      await tokenBlacklist.add(token);

      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
    });

    it('should throw error for token without expiration', async () => {
      const token = 'invalid.jwt.token';

      (tokenManager.getTokenExpiration as jest.Mock).mockReturnValue(null);

      await expect(tokenBlacklist.add(token)).rejects.toThrow('Invalid token: no expiration found');
    });

    it('should use SHA256 hash of token as key', async () => {
      const token = 'test.jwt.token';
      const futureTimestamp = Math.floor(Date.now() / 1000) + 900;

      (tokenManager.getTokenExpiration as jest.Mock).mockReturnValue(futureTimestamp);

      await tokenBlacklist.add(token);

      const expectedHash = createHash('sha256').update(token).digest('hex');
      const expectedKey = `blacklist:token:${expectedHash}`;

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        expectedKey,
        expect.any(Number),
        'revoked'
      );
    });
  });

  describe('isBlacklisted()', () => {
    it('should return true when token is blacklisted', async () => {
      const token = 'blacklisted.jwt.token';
      mockRedisClient.get.mockResolvedValue('revoked');

      const result = await tokenBlacklist.isBlacklisted(token);

      expect(result).toBe(true);
      expect(mockRedisClient.get).toHaveBeenCalledWith(expect.stringContaining('blacklist:token:'));
    });

    it('should return false when token is not blacklisted', async () => {
      const token = 'valid.jwt.token';
      mockRedisClient.get.mockResolvedValue(null);

      const result = await tokenBlacklist.isBlacklisted(token);

      expect(result).toBe(false);
    });

    it('should use correct key format', async () => {
      const token = 'test.token';
      await tokenBlacklist.isBlacklisted(token);

      const expectedHash = createHash('sha256').update(token).digest('hex');
      const expectedKey = `blacklist:token:${expectedHash}`;

      expect(mockRedisClient.get).toHaveBeenCalledWith(expectedKey);
    });
  });

  describe('remove()', () => {
    it('should remove token from blacklist', async () => {
      const token = 'token.to.remove';

      await tokenBlacklist.remove(token);

      expect(mockRedisClient.del).toHaveBeenCalledWith(expect.stringContaining('blacklist:token:'));
    });

    it('should use correct key when removing', async () => {
      const token = 'another.token';
      await tokenBlacklist.remove(token);

      const expectedHash = createHash('sha256').update(token).digest('hex');
      const expectedKey = `blacklist:token:${expectedHash}`;

      expect(mockRedisClient.del).toHaveBeenCalledWith(expectedKey);
    });
  });

  describe('revokeAllUserTokens()', () => {
    it('should revoke all user tokens with default TTL (3600s)', async () => {
      const userId = 'user-123';

      await tokenBlacklist.revokeAllUserTokens(userId);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'blacklist:user:user-123',
        3600,
        expect.any(String)
      );
    });

    it('should revoke all user tokens with custom TTL', async () => {
      const userId = 'user-456';
      const customTtl = 7200;

      await tokenBlacklist.revokeAllUserTokens(userId, customTtl);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'blacklist:user:user-456',
        7200,
        expect.any(String)
      );
    });
  });

  describe('areAllUserTokensRevoked()', () => {
    it('should return true when all user tokens are revoked', async () => {
      const userId = 'user-123';
      mockRedisClient.get.mockResolvedValue('1770389515'); // Simula timestamp

      const result = await tokenBlacklist.areAllUserTokensRevoked(userId);

      expect(result).toBe(true);
      expect(mockRedisClient.get).toHaveBeenCalledWith('blacklist:user:user-123');
    });

    it('should return false when user tokens are not revoked', async () => {
      const userId = 'user-456';
      mockRedisClient.get.mockResolvedValue(null);

      const result = await tokenBlacklist.areAllUserTokensRevoked(userId);

      expect(result).toBe(false);
    });
  });
});
