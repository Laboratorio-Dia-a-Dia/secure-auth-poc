import { Router } from 'express';
import { authGuard } from '@shared/middlewares/authGuard';
import { userController } from './user.controller';

const router = Router();

// Todas as rotas de user são protegidas
router.use(authGuard);

// GET /api/users/me
router.get('/me', userController.me.bind(userController));

// PATCH /api/users/password
router.patch('/password', userController.updatePassword.bind(userController));

export { router as userRoutes };
