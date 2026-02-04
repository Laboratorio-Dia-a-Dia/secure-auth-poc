import type { Request, Response, NextFunction } from 'express';
import { authService } from '@modules/auth/auth.service';
import { updatePasswordSchema } from '@modules/auth/auth.schema';

export class UserController {
  async updatePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedData = updatePasswordSchema.parse(req.body);
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'User not authenticated',
        });
        return;
      }

      await authService.updatePassword(userId, validatedData);

      res.status(200).json({
        status: 'success',
        message: 'Password updated successfully. Please login again.',
      });
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      status: 'success',
      data: {
        user: req.user,
      },
    });
  }
}

export const userController = new UserController();
