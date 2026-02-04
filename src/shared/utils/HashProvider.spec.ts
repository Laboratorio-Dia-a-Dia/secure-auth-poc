import { hashProvider } from './HashProvider';

// Mock do env
jest.mock('@config/env', () => ({
  env: {
    ARGON2_MEMORY_COST: 1024,
    ARGON2_TIME_COST: 2,
    ARGON2_PARALLELISM: 1,
  },
}));

describe('HashProvider Unit Tests', () => {
  const password = 'secure-password-123';

  it('should hash a password correctly', async () => {
    const hash = await hashProvider.hash(password);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    expect(hash).toContain('$argon2');
  });

  it('should verify a correct password', async () => {
    const hash = await hashProvider.hash(password);
    const isValid = await hashProvider.compare(password, hash);

    expect(isValid).toBe(true);
  });

  it('should reject an incorrect password', async () => {
    const hash = await hashProvider.hash(password);
    const isValid = await hashProvider.compare('wrong-password', hash);

    expect(isValid).toBe(false);
  });
});
