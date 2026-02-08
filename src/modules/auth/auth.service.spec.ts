import { userRepository } from '@modules/user/user.repository';
import { hashProvider } from '@shared/utils/HashProvider';
import { tokenManager } from '@shared/utils/TokenManager';
import { tokenBlacklist } from '@shared/utils/TokenBlacklist';
import { ConflictError, UnauthorizedError, BadRequestError } from '@shared/errors/AppError';
import { AuthService } from './auth.service';
import { refreshTokenRepository } from './refreshToken.repository';

// Mock dependencies
jest.mock('@modules/user/user.repository');
jest.mock('@shared/utils/HashProvider');
jest.mock('@shared/utils/TokenManager');
jest.mock('@shared/utils/TokenBlacklist');
jest.mock('./refreshToken.repository');
jest.mock('@shared/utils/Logger');

describe('AuthService Unit Tests', () => {
  let authService: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    authService = new AuthService();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const data = { email: 'test@example.com', password: 'Password123!', name: 'Test User' };
      const hashedPassword = 'hashedPassword';
      const createdUser = {
        ...data,
        id: 'user-id',
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (hashProvider.hash as jest.Mock).mockResolvedValue(hashedPassword);
      (userRepository.create as jest.Mock).mockResolvedValue(createdUser);

      const result = await authService.register(data);

      expect(userRepository.findByEmail).toHaveBeenCalledWith(data.email);
      expect(hashProvider.hash).toHaveBeenCalledWith(data.password);
      expect(userRepository.create).toHaveBeenCalled();
      expect(result).toHaveProperty('id', 'user-id');
      expect(result).toHaveProperty('email', data.email);
    });

    it('should throw ConflictError if email already exists', async () => {
      const data = { email: 'existing@example.com', password: 'Password123!', name: 'Test User' };
      (userRepository.findByEmail as jest.Mock).mockResolvedValue({ id: 'existing-id' });

      await expect(authService.register(data)).rejects.toThrow(ConflictError);
      expect(userRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const data = { email: 'test@example.com', password: 'Password123!', rememberMe: false };
    const user = {
      id: 'user-id',
      email: 'test@example.com',
      password: 'hashedPassword',
      name: 'Test User',
    };

    it('should login successfully', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(user);
      (hashProvider.compare as jest.Mock).mockResolvedValue(true);
      (tokenManager.generateAccessToken as jest.Mock).mockReturnValue('access-token');
      (tokenManager.generateRefreshToken as jest.Mock).mockReturnValue('refresh-token');

      const result = await authService.login(data);

      expect(tokenManager.generateAccessToken).toHaveBeenCalled();
      expect(tokenManager.generateRefreshToken).toHaveBeenCalled();
      expect(refreshTokenRepository.create).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
    });

    it('should throw UnauthorizedError if user not found', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);

      await expect(authService.login(data)).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError if password does not match', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(user);
      (hashProvider.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.login(data)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('logout', () => {
    it('should blacklist access token and revoke refresh token', async () => {
      const accessToken = 'access-token';
      const refreshToken = 'refresh-token';
      const payload = { tokenId: 'token-id' };

      (tokenManager.verifyRefreshToken as jest.Mock).mockReturnValue(payload);

      await authService.logout(accessToken, refreshToken);

      expect(tokenBlacklist.add).toHaveBeenCalledWith(accessToken);
      expect(tokenManager.verifyRefreshToken).toHaveBeenCalledWith(refreshToken);
      expect(refreshTokenRepository.revoke).toHaveBeenCalledWith(payload.tokenId);
    });

    it('should handle invalid refresh token during logout gracefully', async () => {
      const accessToken = 'access-token';
      const refreshToken = 'invalid-token';

      (tokenManager.verifyRefreshToken as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authService.logout(accessToken, refreshToken);

      expect(tokenBlacklist.add).toHaveBeenCalledWith(accessToken);
      expect(refreshTokenRepository.revoke).not.toHaveBeenCalled();
    });
  });

  describe('updatePassword', () => {
    const userId = 'user-id';
    const data = { currentPassword: 'oldPassword!', newPassword: 'newPassword!' };
    const user = { id: userId, password: 'hashedOldPassword' };

    it('should update password and revoke all tokens', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(user);
      (hashProvider.compare as jest.Mock).mockResolvedValue(true);
      (hashProvider.hash as jest.Mock).mockResolvedValue('hashedNewPassword');

      await authService.updatePassword(userId, data);

      expect(hashProvider.compare).toHaveBeenCalledWith(data.currentPassword, user.password);
      expect(hashProvider.hash).toHaveBeenCalledWith(data.newPassword);
      expect(userRepository.updatePassword).toHaveBeenCalledWith(userId, 'hashedNewPassword');
      expect(refreshTokenRepository.revokeAllByUserId).toHaveBeenCalledWith(userId);
      expect(tokenBlacklist.revokeAllUserTokens).toHaveBeenCalledWith(userId, 3600);
    });

    it('should throw BadRequestError if user not found', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(authService.updatePassword(userId, data)).rejects.toThrow(BadRequestError);
    });

    it('should throw UnauthorizedError if current password does not match', async () => {
      (userRepository.findById as jest.Mock).mockResolvedValue(user);
      (hashProvider.compare as jest.Mock).mockResolvedValue(false);

      await expect(authService.updatePassword(userId, data)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('refresh', () => {
    const refreshToken = 'valid-refresh-token';
    const payload = { userId: 'user-id', tokenId: 'token-id' };
    const tokenRecord = {
      id: 'record-id',
      user: { id: 'user-id', email: 'test@example.com' },
      expiresAt: new Date(Date.now() + 10000),
      revokedAt: null,
    };

    it('should refresh tokens successfully', async () => {
      (tokenManager.verifyRefreshToken as jest.Mock).mockReturnValue(payload);
      (refreshTokenRepository.findByToken as jest.Mock).mockResolvedValue(tokenRecord);
      (tokenManager.generateAccessToken as jest.Mock).mockReturnValue('new-access-token');
      (tokenManager.generateRefreshToken as jest.Mock).mockReturnValue('new-refresh-token');
      (refreshTokenRepository.create as jest.Mock).mockResolvedValue({ id: 'new-record-id' });

      const result = await authService.refresh(refreshToken);

      expect(result).toHaveProperty('accessToken', 'new-access-token');
      expect(result).toHaveProperty('refreshToken', 'new-refresh-token');
      expect(refreshTokenRepository.setGracePeriod).toHaveBeenCalled();
    });

    it('should detect token reuse and revoke all sessions', async () => {
      const revokedRecord = { ...tokenRecord, revokedAt: new Date() };
      (tokenManager.verifyRefreshToken as jest.Mock).mockReturnValue(payload);
      (refreshTokenRepository.findByToken as jest.Mock).mockResolvedValue(revokedRecord);

      await expect(authService.refresh(refreshToken)).rejects.toThrow('Token reuse detected');
      expect(refreshTokenRepository.revokeAllByUserId).toHaveBeenCalledWith(payload.userId);
      expect(tokenBlacklist.revokeAllUserTokens).toHaveBeenCalledWith(payload.userId, 5);
    });

    it('should throw UnauthorizedError if token record not found', async () => {
      (tokenManager.verifyRefreshToken as jest.Mock).mockReturnValue(payload);
      (refreshTokenRepository.findByToken as jest.Mock).mockResolvedValue(null);

      await expect(authService.refresh(refreshToken)).rejects.toThrow('Invalid refresh token');
    });

    it('should throw UnauthorizedError if token expired', async () => {
      const expiredRecord = { ...tokenRecord, expiresAt: new Date(Date.now() - 1000) };
      (tokenManager.verifyRefreshToken as jest.Mock).mockReturnValue(payload);
      (refreshTokenRepository.findByToken as jest.Mock).mockResolvedValue(expiredRecord);

      await expect(authService.refresh(refreshToken)).rejects.toThrow('Refresh token expired');
    });
  });
});
