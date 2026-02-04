import { PrismaClient } from '@prisma/client';
import type { User } from '@prisma/client';
import { env } from '@config/env';

const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export class UserRepository {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async create(data: { email: string; password: string; name: string }): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        password: data.password,
        name: data.name,
      },
    });
  }

  async updatePassword(userId: string, newPasswordHash: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { password: newPasswordHash },
    });
  }
}

export const userRepository = new UserRepository();
export { prisma };
