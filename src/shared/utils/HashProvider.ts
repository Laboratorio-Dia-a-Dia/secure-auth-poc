import * as argon2 from 'argon2';
import { env } from '@config/env';

export class HashProvider {
  async hash(value: string): Promise<string> {
    // Use lower memory settings in test environment to avoid allocation errors on low-RAM systems
    const isTest = env.NODE_ENV === 'test';

    return argon2.hash(value, {
      type: argon2.argon2id,
      timeCost: isTest ? 2 : env.ARGON2_TIME_COST,
      memoryCost: isTest ? 1024 : env.ARGON2_MEMORY_COST, // 1MB instead of default 64MB
      parallelism: isTest ? 1 : env.ARGON2_PARALLELISM,
    });
  }

  async compare(value: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, value);
    } catch {
      return false;
    }
  }
}

export const hashProvider = new HashProvider();
